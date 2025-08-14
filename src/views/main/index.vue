<script setup lang="ts">
import { onMounted, ref } from 'vue';
import mapboxgl from 'mapbox-gl';
import { SimpleScrollbar } from '@sa/materials';
import type { AntTreeNodeCheckedEvent, AntTreeNodeDropEvent, TreeProps } from 'ant-design-vue/es/tree';
import { AppstoreFilled, DatabaseFilled, DeleteOutlined, TableOutlined, ZoomInOutlined, PlusOutlined } from '@ant-design/icons-vue';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import type { Feature, GeoJsonProperties, Geometry } from 'geojson';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import MapScene from '@/utils/mapUtils/mapModels/MapScene';
import { fetchGetLayerTree } from '@/service/api';
import AttributeTableWindow from '@/components/common/AttributeTableWindow.vue';
import { createFeatureWithAttributes } from '@/utils/mapUtils/featureUtils';
import ChatBox from './modules/chat-box.vue';
import type { ChatBoxExpose } from './modules/chat-box.vue';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken =
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ||
  'pk.eyJ1IjoiYWJyYWhhbW1tIiwiYSI6ImNtZDl4d2w0bTBhY20ycnF5em5oYXdqNmcifQ.x95HbEdqkB7accFJAeIKBA';

let map: mapboxgl.Map;
const draw: MapboxDraw = new MapboxDraw({
  displayControlsDefault: true
});

let scene: MapScene | null = null;

const mapContainer = ref<HTMLElement | null>(null);
const chatBoxRef = ref<ChatBoxExpose | null>(null);
const dataTree = ref<Map.LayerData[]>([]);
const treeData = ref<TreeProps['treeData']>([]);
const layerTreeData = ref<TreeProps['treeData']>([]);

const expandedKeys = ref<string[]>([]);
const checkedKeys = ref<string[]>([]);

const drawerOpen = ref(true);

const drawData = ref<Feature<Geometry, GeoJsonProperties> | null>(null);

// 已提示过错误的 sourceId 集合，避免重复打扰
const warnedSourceIds = new Set<string>();

// 属性表相关
const attributeTableVisible = ref(false);
const selectedLayerId = ref<string>('');
const selectedLayerName = ref<string>('');

// 绘制要素相关
const selectedDrawFeatures = ref<Feature[]>([]);
const drawContextMenuVisible = ref(false);
const drawContextMenuPosition = ref({ x: 0, y: 0 });
const featureNameModalVisible = ref(false);
const featureName = ref<string>('');
// 存储绘制要素的属性数据
const drawFeaturesData = ref<Map<string, any[]>>(new Map());
// 右键过程中抑制选择变化（防止右键立即覆盖左键多选）
const suppressSelectionOnContext = ref(false);
// 最近一次稳定的选择快照（仅在非右键情形下更新）
const lastStableSelected = ref<Feature[]>([]);

const showDrawer = () => {
  drawerOpen.value = true;
};

const onContextMenuClick = (id: string, title: string) => {
  console.log(`右键添加图层: ${id} - ${title}`);

  // 检查是否已经在图层管理面板中
  const existingLayer = layerTreeData.value?.find(item => item?.key === id);
  if (existingLayer) {
    console.log(`图层 ${id} 已存在于图层管理面板中`);
    // 如果已存在，确保勾选状态
    if (!checkedKeys.value.includes(id)) {
      checkedKeys.value.push(id);
    }
    return;
  }

  // 加载图层节点
  const loadSuccess = scene?.loadNode(id);
  if (loadSuccess) {
    console.log(`图层 ${id} 加载成功，添加到图层管理面板`);
    // 添加到图层管理面板
    layerTreeData.value = [{ title, key: id, children: [] }, ...(layerTreeData.value || [])];
    // 设置为勾选状态
    checkedKeys.value.push(id);
  } else {
    console.log(`图层 ${id} 加载失败或已经加载过`);
    // 即使加载失败，也可能是因为已经加载过，尝试添加到面板
    const node = scene?.findNodeById(id);
    if (node) {
      layerTreeData.value = [{ title, key: id, children: [] }, ...(layerTreeData.value || [])];
      checkedKeys.value.push(id);
      // 确保图层可见
      scene?.openNode(id);
    } else {
      window.$message?.warning('该图层数据未就绪或不可用');
    }
  }
};

const onLoadNodesByName = (input: { id: string; name: string }[]) => {
  input.forEach(item => {
    const nodeId = scene?.loadNodeByName(item.id);
    console.log(nodeId);
    if (nodeId) {
      layerTreeData.value = [{ title: item.name, key: nodeId, children: [] }, ...(layerTreeData.value || [])];
      checkedKeys.value.push(nodeId);
    }
  });
};

const onLayerTreeDrop = (info: AntTreeNodeDropEvent) => {
  if (!scene) return;

  const data = [...(layerTreeData.value || [])];
  const dragKey = String(info.dragNode.key);
  const dropKey = String(info.node.key);

  const dragIndex = data.findIndex(item => item?.key === dragKey);
  const dropIndex = data.findIndex(item => item?.key === dropKey);

  // 先从旧位置移除
  const [removed] = data.splice(dragIndex, 1);

  // 计算插入的新位置（树已禁止 dropPosition === 0）
  let newIndex = dropIndex;
  if (info.dropPosition === -1) newIndex = dropIndex;       // 上方
  else if (info.dropPosition === 1) newIndex = dropIndex + 1; // 下方

  // 插入到新位置
  data.splice(newIndex, 0, removed);

  // 仅用"新顺序中最近的上一个有效图层节点"作为锚点
  function findPrevValidId(index: number): string | null {
    for (let i = index - 1; i >= 0; i--) {
      const k = String(data[i]?.key);
      if (scene?.findNodeById(k)) return k;
    }
    return null;
  }
  const beforeId = findPrevValidId(newIndex);

  // 确保源/锚点节点已加载并可见
  if (beforeId) {
    scene.loadNode(beforeId);
    scene.openNode(beforeId);
  }
  scene.loadNode(dragKey);
  scene.openNode(dragKey);

  // 把拖拽图层移动到 beforeId 之前；如果 beforeId = null，则移到最顶层
  scene.moveNode(dragKey, beforeId);

  // 更新面板顺序
  layerTreeData.value = [...data];

  // 全量重排：按面板从下到上依次移到顶，确保压盖顺序一致
  const forceReorderByPanel = () => {
    const items = (layerTreeData.value || [])
      .map(it => String(it?.key))
      .filter(k => !!scene?.findNodeById(k)); // 过滤分组/无效节点
    for (let i = items.length - 1; i >= 0; i--) {
      const id = items[i];
      scene?.loadNode(id);
      scene?.openNode(id);
      scene?.moveNode(id, null); // null = 移到最顶
    }
  };

  // Draw 图层（gl-draw-）如需保留显示，将其作为整体块一起移动
  const moveDrawBlock = (anchorId: string | null) => {
    const m = scene?.map;
    if (!m) return;
    const ids = (m.getStyle().layers || []).map(l => l.id).filter(id => id.startsWith('gl-draw-'));
    ids.forEach(id => {
      if (anchorId) m.moveLayer(id, anchorId);
      else m.moveLayer(id);
    });
  };

  // 延迟到样式空闲后再统一重排，避免目标层尚未挂载
  const m = scene?.map;
  if (m) {
    m.once('idle', () => {
      forceReorderByPanel();

      // 若你没有调用 draw.deleteAll() 清掉 Draw 的渲染层，则同步移动它的块位置
      const panel = layerTreeData.value || [];
      const drawGroupIdx = panel.findIndex(it => it?.key === 'draw_features');
      if (drawGroupIdx !== -1) {
        let anchor: string | null = null;
        for (let i = drawGroupIdx + 1; i < panel.length; i++) {
          const k = String(panel[i]?.key);
          if (scene?.findNodeById(k)) { anchor = k; break; }
        }
        moveDrawBlock(anchor);
      }
    });
  }
};

const onLayerCheckClick = (_: any, e: AntTreeNodeCheckedEvent) => {
  const nodeId = String(e.node.key);
  console.log(`图层管理面板勾选状态变化: ${nodeId}, 勾选: ${e.checked}`);

  if (nodeId === 'draw_features') {
    // 处理绘制要素分组的勾选
    const drawGroup = layerTreeData.value?.find(item => item?.key === 'draw_features');
    console.log('绘制要素分组勾选状态变化:', { checked: e.checked, children: drawGroup?.children });
    
    if (drawGroup?.children) {
      if (e.checked) {
        // 显示所有绘制要素
        drawGroup.children.forEach(child => {
          const childId = String(child.key);
          console.log(`处理绘制要素: ${childId}, 当前checkedKeys:`, checkedKeys.value);
          
                  // 强制添加到checkedKeys并显示图层
        if (!checkedKeys.value.includes(childId)) {
          checkedKeys.value.push(childId);
        }
        
        // 强制更新checkedKeys状态
        checkedKeys.value = [...checkedKeys.value];
          
          // 对于绘制要素，需要先确保节点已加载，然后显示
          const node = scene?.findNodeById(childId);
          console.log(`节点状态: ${childId}`, { 
            exists: !!node, 
            active: node?.active, 
            layers: node?.layers?.length 
          });
          
          if (node) {
            if (!node.active) {
              // 如果节点存在但未激活，先加载再显示
              console.log(`加载并显示节点: ${childId}`);
              scene?.loadNode(childId);
            } else {
              // 如果节点已激活，直接显示
              console.log(`直接显示节点: ${childId}`);
              scene?.openNode(childId);
            }
            
            // 确保图层可见
            setTimeout(() => {
              const updatedNode = scene?.findNodeById(childId);
              if (updatedNode?.active) {
                console.log(`确保图层可见: ${childId}`);
                scene?.openNode(childId);
              }
            }, 100);
          } else {
            console.warn(`节点不存在: ${childId}`);
          }
        });
      } else {
        // 隐藏所有绘制要素
        drawGroup.children.forEach(child => {
          const childId = String(child.key);
          // 强制从checkedKeys中移除
          checkedKeys.value = checkedKeys.value.filter(key => key !== childId);
          scene?.closeNode(childId);
          console.log(`隐藏绘制要素: ${childId}`);
        });
      }
    }
  } else {
    // 处理单个图层的勾选
    if (e.checked) {
      // 先尝试加载图层（如果还未加载），然后显示
      const loadSuccess = scene?.loadNode(nodeId);
      if (loadSuccess) {
        console.log(`图层 ${nodeId} 首次加载成功`);
      } else {
        // 如果加载失败（可能已经加载过），则直接显示
        scene?.openNode(nodeId);
        console.log(`图层 ${nodeId} 设置为可见`);
        if (!scene?.isNodeActive(nodeId)) {
          window.$message?.warning('该图层数据未就绪或不可用');
        }
      }
    } else {
      // 隐藏图层但不移除
      scene?.closeNode(nodeId);
      console.log(`图层 ${nodeId} 设置为隐藏`);
    }
  }
};

const replaceProperties = (node: Map.BaseTreeNode): Map.LayerData => {
  const { layerName, tableName, ...rest } = node;
  return {
    ...rest,
    name: tableName,
    name_cn: layerName,
    children: node.children.map(child => replaceProperties(child))
  };
};

const initData = async () => {
  try {
    const data = await fetchGetLayerTree();
    console.log('获取到的图层树数据:', data);
    return replaceProperties(data);
  } catch (error) {
    console.error('获取图层树数据失败:', error);
    // 返回空的数据结构
    return {
      id: 'root',
      name: 'root',
      name_cn: '根节点',
      category: 'static',
      usage: null,
      children: []
    };
  }
};

// 提取树中每个可作为图层的节点（包含叶子与带子节点但有 usage 的节点）
const extractNodes = (tree: Map.LayerData[]): Map.LayerData[] => {
  const result: Map.LayerData[] = [];

  function traverse(node: Map.LayerData) {
    // 任何非 static 且存在 usage 的节点都视为可加载图层
    if (node.category !== 'static' && node.usage !== null) {
      result.push({ ...node });
    }

    // 继续遍历子节点
    if (node.children && node.children.length > 0) {
      node.children.forEach((child: Map.LayerData) => traverse(child));
    }
  }

  tree.forEach(root => traverse(root));

  return result;
};

const convertToTreeData = (layers: Map.LayerData[]): TreeProps['treeData'] => {
  return layers.map(layer => ({
    key: layer.id,
    title: layer.name_cn,
    children: layer.children ? convertToTreeData(layer.children) : undefined,
    isLayer: layer.usage !== null
  }));
};

/// /////////// 地图绘制 ///////////////
const startDraw = () => {
  if (draw.getAll()) {
    draw.deleteAll();
    draw.changeMode('draw_line_string');
  }
};

const finishDraw = () => {
  if (draw.getAll().features.length === 0) return;
  const drawFeature = draw.getAll().features[0];
  drawData.value = drawFeature;
  chatBoxRef.value?.processDraw(drawData.value.geometry);
  draw.changeMode('simple_select');
};

const addAnalysisResults = (results: { id: string; name: string; name_cn: string; feature: Feature }[]) => {
  if (!treeData.value?.find(item => item.title === '分析结果集')) {
    treeData.value?.push({
      key: 'analysis_result',
      title: '分析结果集',
      children: [],
      isLayer: false
    });
  }
  const resultList = treeData.value?.find(item => item.title === '分析结果集')?.children;
  results.forEach(result => {
    scene?.addTempNode(result.id, result.name, result.feature);
    if (scene?.loadNode(result.id)) {
      resultList?.push({
        key: result.id,
        title: result.name_cn,
        children: [],
        isLayer: true
      });
      layerTreeData.value = [{ title: result.name_cn, key: result.id, children: [] }, ...(layerTreeData.value || [])];
      checkedKeys.value.push(result.id);
    }
  });
};

// 右键图层管理界面的菜单处理
const onLayerContextMenuClick = async (menuKey: string, layerKey: string, layerTitle: string) => {
  console.log(`图层管理右键菜单: ${menuKey} - ${layerKey} - ${layerTitle}`);

  switch (menuKey) {
    case 'viewAttributes':
      selectedLayerId.value = layerKey;
      selectedLayerName.value = layerTitle;
      attributeTableVisible.value = true;
      break;
    case 'removeLayer':
      // 从图层管理面板移除图层
      if (layerKey === 'draw_features') {
        // 移除整个绘制要素分组及其所有子节点
        const drawGroup = layerTreeData.value?.find(item => item?.key === 'draw_features');
        const childIds = (drawGroup?.children || []).map(c => String(c.key));
        // 逐个从场景与本地缓存移除
        childIds.forEach(id => {
          scene?.removeNode(id);
          drawFeaturesData.value.delete(id);
          // 从勾选中移除
          checkedKeys.value = checkedKeys.value.filter(k => k !== id);
        });
        // 移除组节点
        layerTreeData.value = (layerTreeData.value || []).filter(item => item?.key !== 'draw_features');
        // 从勾选中移除组本身
        checkedKeys.value = checkedKeys.value.filter(k => k !== 'draw_features');
        // 若当前属性表指向组或其任一子节点，关闭
        if (
          selectedLayerId.value === 'draw_features' ||
          childIds.includes(selectedLayerId.value)
        ) {
          attributeTableVisible.value = false;
          selectedLayerId.value = '';
          selectedLayerName.value = '';
        }
        window.$message?.success('已移除绘制要素分组及其所有子图层');
      } else if (layerKey.startsWith('draw_')) {
        // 绘制要素：从绘制要素分组中移除
        const drawGroup = layerTreeData.value?.find(item => item?.key === 'draw_features');
        if (drawGroup?.children) {
          drawGroup.children = drawGroup.children.filter(child => child?.key !== layerKey);
          // 如果绘制要素分组为空，移除整个分组
          if (drawGroup.children.length === 0) {
            layerTreeData.value = layerTreeData.value?.filter(item => item?.key !== 'draw_features') || [];
          }
        }
        // 从本地数据存储中移除
        drawFeaturesData.value.delete(layerKey);
        // 从场景中完全移除
        scene?.removeNode(layerKey);
        // 从勾选里移除
        checkedKeys.value = checkedKeys.value.filter(key => key !== layerKey);
        // 如果属性窗在看这个层，关闭
        if (selectedLayerId.value === layerKey) {
          attributeTableVisible.value = false;
          selectedLayerId.value = '';
          selectedLayerName.value = '';
        }
      } else {
        // 普通图层：从图层管理面板移除
        layerTreeData.value = layerTreeData.value?.filter(item => item?.key !== layerKey) || [];
        // 隐藏图层但不完全移除（保持在scene中以便重新添加）
        scene?.closeNode(layerKey);
      }
      window.$message?.success(`已从图层管理中移除 ${layerTitle}`);
      break;
    case 'zoomToLayer':
      // 缩放到图层
      await zoomToLayer(layerKey, layerTitle);
      break;
    default:
      break;
  }
};

// 处理绘制要素右键菜单（使用稳定快照以防右键覆盖多选）
const handleDrawContextMenu = (e: mapboxgl.MapMouseEvent) => {
  e.preventDefault();
  // 在菜单处理开始即抑制选择变化
  suppressSelectionOnContext.value = true;
  // 优先使用最近一次稳定快照（左键多选完成时更新）
  const stable = lastStableSelected.value;
  const current = draw.getSelected().features;
  const features = stable.length > 0 ? stable : current;
  if (features.length > 0) {
    selectedDrawFeatures.value = features;
    const mouseEvent = e.originalEvent;
    drawContextMenuPosition.value = { x: mouseEvent.clientX, y: mouseEvent.clientY };
    drawContextMenuVisible.value = true;
  }
  // 在菜单完全关闭后再解除抑制，为保险这里不自动解除
};

// 关闭右键菜单
const closeDrawContextMenu = () => {
  drawContextMenuVisible.value = false;
  // 菜单关闭后再解除抑制，并同步一次稳定快照
  suppressSelectionOnContext.value = false;
  const selected = draw.getSelected();
  lastStableSelected.value = [...selected.features];
};

// 处理添加要素到图层
const handleAddFeatureToLayer = () => {
  drawContextMenuVisible.value = false;
  featureName.value = '';
  featureNameModalVisible.value = true;
};

// 确认添加要素到图层
const confirmAddFeatureToLayer = () => {
  if (!featureName.value.trim()) {
    window.$message?.warning('请输入要素名称');
    return;
  }

  // 为所有选中的要素创建带属性的新要素
  const featuresWithAttributes = selectedDrawFeatures.value.map((originalFeature, index) => {
    const nameWithIndex = selectedDrawFeatures.value.length > 1 
      ? `${featureName.value}_${index + 1}` 
      : featureName.value;
    
    return createFeatureWithAttributes(originalFeature, nameWithIndex);
  });

  // 创建包含多个要素的GeoJSON FeatureCollection
  const featureCollection = {
    type: 'FeatureCollection',
    features: featuresWithAttributes
  };

  // 生成唯一图层ID
  const layerId = `draw_${Date.now()}`;
  
  // 保存所有要素的属性数据到本地存储
  const allProperties = featuresWithAttributes.map(feature => feature.properties);
  drawFeaturesData.value.set(layerId, allProperties);
  
  // 添加到场景中（使用FeatureCollection）
  scene?.addTempNodeFromCollection(layerId, featureName.value, featureCollection);
  
  // 加载并显示图层
  const loadSuccess = scene?.loadNode(layerId);
  console.log(`加载绘制要素图层: ${layerId}, 成功: ${loadSuccess}`);
  
  // 即使loadNode返回false，也要添加到图层管理（可能是已经加载过了）
  if (loadSuccess || scene?.findNodeById(layerId)) {
    // 添加到绘制要素分组
    if (!layerTreeData.value?.find(item => item?.key === 'draw_features')) {
      layerTreeData.value?.unshift({
        key: 'draw_features',
        title: '绘制要素',
        children: [],
        isLayer: false
      });
    }
    
    const drawGroup = layerTreeData.value?.find(item => item?.key === 'draw_features');
    drawGroup?.children?.push({
      key: layerId,
      title: `${featureName.value} (${featuresWithAttributes.length}个要素)`,
      isLayer: true
    });
    
    checkedKeys.value.push(layerId);
    
    // 确保节点状态正确
    const node = scene?.findNodeById(layerId);
    console.log(`绘制要素节点状态: ${layerId}`, { 
      exists: !!node, 
      active: node?.active, 
      layers: node?.layers?.length,
      featureCount: featuresWithAttributes.length
    });
    
    console.log('添加绘制要素到图层:', {
      id: layerId,
      name: featureName.value,
      featureCount: featuresWithAttributes.length,
      attributes: allProperties,
      data: drawFeaturesData.value.get(layerId)
    });
  } else {
    console.error(`加载绘制要素图层失败: ${layerId}`);
  }

  window.$message?.success(`已添加 ${selectedDrawFeatures.value.length} 个要素到图层 "${featureName.value}"`);
  featureNameModalVisible.value = false;
  
  // 清除绘制的要素（可选）
  // draw.deleteAll();
  draw.deleteAll(); // 清空Draw控件自带的gl-draw-*图层显示
};

// 取消添加要素到图层
const cancelAddFeatureToLayer = () => {
  featureNameModalVisible.value = false;
  featureName.value = '';
};

// 添加框选控件
const addBoxZoomControls = () => {
  // 创建框选放大按钮
  const boxZoomInBtn = document.createElement('button');
  boxZoomInBtn.className = 'mapboxgl-ctrl-icon box-zoom-in-btn';
  boxZoomInBtn.title = '框选放大';
  boxZoomInBtn.textContent = '⊞';  // 使用 textContent 而不是 innerHTML
  boxZoomInBtn.style.cssText = `
    background: white !important;
    border: none !important;
    width: 29px !important;
    height: 29px !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 16px !important;
    font-weight: bold !important;
    color: #374151 !important;
    box-sizing: border-box !important;
  `;

  // 创建框选缩小按钮
  const boxZoomOutBtn = document.createElement('button');
  boxZoomOutBtn.className = 'mapboxgl-ctrl-icon box-zoom-out-btn';
  boxZoomOutBtn.title = '框选缩小';
  boxZoomOutBtn.textContent = '⊟';  // 使用 textContent 而不是 innerHTML
  boxZoomOutBtn.style.cssText = `
    background: white !important;
    border: none !important;
    width: 29px !important;
    height: 29px !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 16px !important;
    font-weight: bold !important;
    color: #374151 !important;
    box-sizing: border-box !important;
  `;

  // 框选状态变量
  let isBoxZooming = false;
  let boxZoomType: 'in' | 'out' | null = null;

  // 框选功能实现
  const startBoxZoom = (type: 'in' | 'out') => {
    if (isBoxZooming) {
      // 如果已经在框选模式，则退出
      exitBoxZoom();
      return;
    }

    isBoxZooming = true;
    boxZoomType = type;
    
    // 更新按钮状态
    if (type === 'in') {
      boxZoomInBtn.style.setProperty('background-color', '#007cbf', 'important');
      boxZoomInBtn.style.setProperty('color', 'white', 'important');
      boxZoomOutBtn.style.setProperty('background-color', 'white', 'important');
      boxZoomOutBtn.style.setProperty('color', '#374151', 'important');
    } else {
      boxZoomOutBtn.style.setProperty('background-color', '#007cbf', 'important');
      boxZoomOutBtn.style.setProperty('color', 'white', 'important');
      boxZoomInBtn.style.setProperty('background-color', 'white', 'important');
      boxZoomInBtn.style.setProperty('color', '#374151', 'important');
    }

    // 禁用默认的框选缩放
    map.boxZoom.disable();
    
    // 改变光标样式
    map.getCanvasContainer().style.cursor = 'crosshair';

    // 添加框选事件监听器
    const canvas = map.getCanvasContainer();
    let startPoint: [number, number] | null = null;
    let box: HTMLElement | null = null;

    const onMouseDown = (e: MouseEvent) => {
      if (!isBoxZooming) return;
      
      // 阻止地图拖拽
      e.preventDefault();
      e.stopPropagation();
      map.dragPan.disable();
      
      startPoint = [e.clientX, e.clientY];
      
      // 创建选择框
      box = document.createElement('div');
      box.style.cssText = `
        position: absolute;
        border: 2px dashed #007cbf;
        background-color: rgba(0, 124, 191, 0.1);
        pointer-events: none;
        z-index: 9999;
      `;
      canvas.appendChild(box);

      const onMouseMove = (e: MouseEvent) => {
        if (!startPoint || !box) return;
        
        const currentPoint = [e.clientX, e.clientY];
        const rect = canvas.getBoundingClientRect();
        
        const minX = Math.min(startPoint[0], currentPoint[0]) - rect.left;
        const minY = Math.min(startPoint[1], currentPoint[1]) - rect.top;
        const maxX = Math.max(startPoint[0], currentPoint[0]) - rect.left;
        const maxY = Math.max(startPoint[1], currentPoint[1]) - rect.top;
        
        box.style.left = minX + 'px';
        box.style.top = minY + 'px';
        box.style.width = (maxX - minX) + 'px';
        box.style.height = (maxY - minY) + 'px';
      };

      const onMouseUp = (e: MouseEvent) => {
        if (!startPoint || !box) return;
        
        const endPoint = [e.clientX, e.clientY];
        const rect = canvas.getBoundingClientRect();
        
        // 计算地理边界
        const sw = map.unproject([
          Math.min(startPoint[0], endPoint[0]) - rect.left,
          Math.max(startPoint[1], endPoint[1]) - rect.top
        ]);
        const ne = map.unproject([
          Math.max(startPoint[0], endPoint[0]) - rect.left,
          Math.min(startPoint[1], endPoint[1]) - rect.top
        ]);

        const bounds = new mapboxgl.LngLatBounds(sw, ne);

        if (boxZoomType === 'in') {
          // 框选放大
          map.fitBounds(bounds, { padding: 20 });
        } else if (boxZoomType === 'out') {
          // 框选缩小
          const currentBounds = map.getBounds();
          const currentZoom = map.getZoom();
          
          if (currentBounds) {
            const selectedArea = (ne.lng - sw.lng) * (ne.lat - sw.lat);
            const currentArea = (currentBounds.getEast() - currentBounds.getWest()) * 
                               (currentBounds.getNorth() - currentBounds.getSouth());
            
            if (selectedArea > 0 && currentArea > 0) {
              const zoomDelta = Math.log2(selectedArea / currentArea);
              const newZoom = Math.max(0, currentZoom + zoomDelta - 1);
              
              map.easeTo({
                zoom: newZoom,
                center: bounds.getCenter()
              });
            }
          }
        }

        // 清理
        canvas.removeChild(box);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        // 重新启用地图拖拽
        map.dragPan.enable();
        
        exitBoxZoom();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    };

    canvas.addEventListener('mousedown', onMouseDown);
  };

  const exitBoxZoom = () => {
    isBoxZooming = false;
    boxZoomType = null;
    
    // 恢复按钮状态
    boxZoomInBtn.style.setProperty('background-color', 'white', 'important');
    boxZoomInBtn.style.setProperty('color', '#374151', 'important');
    boxZoomOutBtn.style.setProperty('background-color', 'white', 'important');
    boxZoomOutBtn.style.setProperty('color', '#374151', 'important');
    
    // 恢复光标
    map.getCanvasContainer().style.cursor = '';
    
    // 重新启用地图拖拽和默认框选
    map.dragPan.enable();
    map.boxZoom.enable();
  };

  // 绑定点击事件
  boxZoomInBtn.addEventListener('click', () => startBoxZoom('in'));
  boxZoomOutBtn.addEventListener('click', () => startBoxZoom('out'));

  // 将按钮添加到全局变量，供后续使用
  (window as any).boxZoomControls = { boxZoomInBtn, boxZoomOutBtn };
};

// 创建水平控制栏
const createHorizontalControlBar = () => {
  // 创建控制栏容器
  const controlBar = document.createElement('div');
  controlBar.className = 'horizontal-control-bar';
  controlBar.style.cssText = `
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    border-radius: 8px;
    padding: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
  `;

  // 获取现有控件
  // 不再获取导航控件，因为我们已经不添加它了
  const drawControl = document.querySelector('.mapboxgl-ctrl-top-left .mapboxgl-ctrl-group');
  const boxZoomControls = (window as any).boxZoomControls;

  // 创建导航控件组
  const navGroup = document.createElement('div');
  navGroup.className = 'mapboxgl-ctrl-group';
  navGroup.style.cssText = `
    display: flex;
    border-radius: 6px;
    overflow: hidden;
    margin: 0;
  `;

  // 创建放大按钮
  const zoomInBtn = document.createElement('button');
  zoomInBtn.className = 'mapboxgl-ctrl-icon mapboxgl-ctrl-zoom-in';
  zoomInBtn.title = '放大';
  zoomInBtn.innerHTML = '+';
  zoomInBtn.style.cssText = `
    background: white;
    border: none;
    width: 29px;
    height: 29px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: bold;
    color: #374151;
  `;
  zoomInBtn.addEventListener('click', () => map.zoomIn());

  // 创建缩小按钮
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.className = 'mapboxgl-ctrl-icon mapboxgl-ctrl-zoom-out';
  zoomOutBtn.title = '缩小';
  zoomOutBtn.innerHTML = '−';
  zoomOutBtn.style.cssText = `
    background: white;
    border: none;
    width: 29px;
    height: 29px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: bold;
    color: #374151;
  `;
  zoomOutBtn.addEventListener('click', () => map.zoomOut());

  navGroup.appendChild(zoomInBtn);
  navGroup.appendChild(zoomOutBtn);
  controlBar.appendChild(navGroup);

  // 添加分隔线
  const divider1 = document.createElement('div');
  divider1.style.cssText = `
    width: 1px;
    height: 24px;
    background: rgba(0, 0, 0, 0.1);
    margin: 0 4px;
  `;
  controlBar.appendChild(divider1);

  // 添加框选控件
  if (boxZoomControls) {
    const boxZoomGroup = document.createElement('div');
    boxZoomGroup.className = 'mapboxgl-ctrl-group';
    boxZoomGroup.style.cssText = `
      display: flex;
      border-radius: 6px;
      overflow: hidden;
      margin: 0;
    `;
    boxZoomGroup.appendChild(boxZoomControls.boxZoomInBtn);
    boxZoomGroup.appendChild(boxZoomControls.boxZoomOutBtn);
    controlBar.appendChild(boxZoomGroup);

    // 添加分隔线
    const divider2 = document.createElement('div');
    divider2.style.cssText = `
      width: 1px;
      height: 24px;
      background: rgba(0, 0, 0, 0.1);
      margin: 0 4px;
    `;
    controlBar.appendChild(divider2);
  }

  if (drawControl) {
    // 直接克隆原生的绘制控件，保持原生样式和功能
    const drawClone = drawControl.cloneNode(true) as HTMLElement;
    drawClone.style.cssText = `
      display: flex;
      border-radius: 6px;
      overflow: hidden;
      margin: 0;
    `;
    
    // 获取按钮元素
    const buttons = drawClone.querySelectorAll('button');
    const originalButtons = drawControl.querySelectorAll('button');
    
    // 存储当前选中的绘制模式和按钮
    let currentDrawMode: string | null = null;
    let currentDrawButton: HTMLElement | null = null;

    // 只为绘制按钮（点、线、面）添加选中状态管理
    
    // 调试：打印所有按钮的类名
    console.log('绘制控件按钮类名:');
    buttons.forEach((btn, index) => {
      console.log(`按钮 ${index}:`, btn.className);
    });
    
    buttons.forEach((button, index) => {
      const originalButton = originalButtons[index];
      if (originalButton) {
        // 为按钮添加点击事件委托
        button.addEventListener('click', () => {
          // 触发原始按钮的点击事件
          originalButton.click();
          
          // 检查是否是绘制按钮（需要状态管理的按钮）
          // 使用更灵活的方法来识别按钮类型
          let buttonMode = '';
          let isDrawingButton = false;
          
          // 检查各种可能的类名组合
          if (button.classList.contains('mapbox-gl-draw_point')) {
            buttonMode = 'draw_point';
            isDrawingButton = true;
          } else if (button.classList.contains('mapbox-gl-draw_line_string') || 
                     button.classList.contains('mapbox-gl-draw_line') ||
                     button.title?.includes('线') || 
                     button.title?.includes('line')) {
            buttonMode = 'draw_line_string';
            isDrawingButton = true;
          } else if (button.classList.contains('mapbox-gl-draw_polygon')) {
            buttonMode = 'draw_polygon';
            isDrawingButton = true;
          }
          
          if (isDrawingButton) {

            // 检查是否点击了当前已选中的按钮（切换功能）
            if (currentDrawButton === button && currentDrawMode === buttonMode) {
              // 取消选中状态，退出绘制模式
              currentDrawMode = null;
              currentDrawButton = null;
              button.classList.remove('active');
              draw.changeMode('simple_select');
            } else {
              // 选中新的绘制工具
              currentDrawMode = buttonMode;
              currentDrawButton = button as HTMLElement;
              
              // 重置所有绘制按钮的选中状态
              buttons.forEach(btn => {
                if (btn.classList.contains('mapbox-gl-draw_point') ||
                    btn.classList.contains('mapbox-gl-draw_line_string') ||
                    btn.classList.contains('mapbox-gl-draw_line') ||
                    btn.classList.contains('mapbox-gl-draw_polygon') ||
                    btn.title?.includes('线') || 
                    btn.title?.includes('点') || 
                    btn.title?.includes('面')) {
                  btn.classList.remove('active');
                }
              });
              
              // 设置当前按钮为选中状态
              button.classList.add('active');
            }
          } else {
            // 非绘制按钮（如删除、合并、拆分等）点击后清除选中状态
            if (button.classList.contains('mapbox-gl-draw_trash')) {
              currentDrawMode = null;
              currentDrawButton = null;
              buttons.forEach(btn => {
                if (btn.classList.contains('mapbox-gl-draw_point') ||
                    btn.classList.contains('mapbox-gl-draw_line_string') ||
                    btn.classList.contains('mapbox-gl-draw_line') ||
                    btn.classList.contains('mapbox-gl-draw_polygon') ||
                    btn.title?.includes('线') || 
                    btn.title?.includes('点') || 
                    btn.title?.includes('面')) {
                  btn.classList.remove('active');
                }
              });
            }
          }
        });
      }
    });

    // 监听绘制完成事件，保持绘制状态
    map.on('draw.create', () => {
      // 绘制完成后，如果有选中的模式，继续保持该模式
      if (currentDrawMode && currentDrawButton) {
        setTimeout(() => {
          if (currentDrawMode) {
            // 确保按钮保持选中状态
            currentDrawButton?.classList.add('active');
            // 继续相同的绘制模式
            draw.changeMode(currentDrawMode as any);
          }
        }, 50);
      }
    });

    // 监听线绘制完成事件（线绘制有特殊的完成逻辑）
    map.on('draw.update', () => {
      // 线绘制更新时也保持状态
      if (currentDrawMode === 'draw_line_string' && currentDrawButton) {
        setTimeout(() => {
          currentDrawButton?.classList.add('active');
        }, 10);
      }
    });

    // 监听绘制模式变化，但不自动清除选中状态
    map.on('draw.modechange', (e: any) => {
      // 只在手动切换到 simple_select 模式时才清除状态
      if (e.mode === 'simple_select' && !currentDrawMode) {
        buttons.forEach(btn => {
          if (btn.classList.contains('mapbox-gl-draw_point') ||
              btn.classList.contains('mapbox-gl-draw_line_string') ||
              btn.classList.contains('mapbox-gl-draw_line') ||
              btn.classList.contains('mapbox-gl-draw_polygon') ||
              btn.title?.includes('线') || 
              btn.title?.includes('点') || 
              btn.title?.includes('面')) {
            btn.classList.remove('active');
          }
        });
      }
      
      // 如果有当前选中的模式，确保对应按钮保持选中状态
      if (currentDrawMode && currentDrawButton) {
        // 先清除所有状态
        buttons.forEach(btn => {
          if (btn.classList.contains('mapbox-gl-draw_point') ||
              btn.classList.contains('mapbox-gl-draw_line_string') ||
              btn.classList.contains('mapbox-gl-draw_line') ||
              btn.classList.contains('mapbox-gl-draw_polygon') ||
              btn.title?.includes('线') || 
              btn.title?.includes('点') || 
              btn.title?.includes('面')) {
            btn.classList.remove('active');
          }
        });
        
        // 保持当前选中按钮的状态
        currentDrawButton.classList.add('active');
      }
    });
    
    // 添加定时检查，确保选中状态不会丢失
    const stateChecker = setInterval(() => {
      if (currentDrawMode && currentDrawButton) {
        // 如果有选中的模式但按钮没有active类，重新添加
        if (!currentDrawButton.classList.contains('active')) {
          currentDrawButton.classList.add('active');
        }
      }
    }, 100);

    // 在控件移除时清理定时器
    const originalRemove = drawClone.remove;
    drawClone.remove = function() {
      clearInterval(stateChecker);
      return originalRemove.call(this);
    };

    controlBar.appendChild(drawClone);
  }

  // 将控制栏添加到地图容器
  const mapContainer = document.getElementById('map-container');
  if (mapContainer) {
    mapContainer.appendChild(controlBar);
  }

  // 隐藏原有绘制控件（导航控件已经不添加了）
  const originalDrawControl = document.querySelector('.mapboxgl-ctrl-top-left') as HTMLElement;
  
  if (originalDrawControl) originalDrawControl.style.display = 'none';

  // 官方罗盘（仅罗盘，不含缩放）
  const barCompass = new mapboxgl.NavigationControl({
    visualizePitch: true,
    showCompass: true,
    showZoom: false
  });
  const compassEl = barCompass.onAdd(map);
  compassEl.style.marginLeft = '6px'; // 与现有按钮留出间距
  controlBar.appendChild(compassEl);
};

// 缩放到图层功能
async function zoomToLayer(layerKey: string, layerTitle: string) {
  try {
    const node = scene?.findNodeById(layerKey);
    if (!node) {
      window.$message?.warning('未找到该图层');
      return;
    }

    // 如果图层有预设的视图范围，直接使用
    if (node.viewState) {
      map.easeTo(node.viewState);
      return;
    }

    // 如果图层未激活，先激活它
    if (!node.active) {
      const loadSuccess = scene?.loadNode(layerKey);
      if (!loadSuccess) {
        window.$message?.warning('无法加载该图层');
        return;
      }
      // 等待图层加载完成
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 尝试查询图层要素来计算边界
    const features = scene?.queryLayerFeatures(layerKey);
    if (features && features.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      let hasValidGeometry = false;

      features.forEach(feature => {
        if (feature.geometry) {
          try {
            switch (feature.geometry.type) {
              case 'Point':
                bounds.extend(feature.geometry.coordinates as [number, number]);
                hasValidGeometry = true;
                break;
              case 'LineString':
                feature.geometry.coordinates.forEach((coord: [number, number]) => {
                  bounds.extend(coord);
                });
                hasValidGeometry = true;
                break;
              case 'Polygon':
                feature.geometry.coordinates[0].forEach((coord: [number, number]) => {
                  bounds.extend(coord);
                });
                hasValidGeometry = true;
                break;
              case 'MultiPoint':
                feature.geometry.coordinates.forEach((coord: [number, number]) => {
                  bounds.extend(coord);
                });
                hasValidGeometry = true;
                break;
              case 'MultiLineString':
                feature.geometry.coordinates.forEach((line: [number, number][]) => {
                  line.forEach((coord: [number, number]) => {
                    bounds.extend(coord);
                  });
                });
                hasValidGeometry = true;
                break;
              case 'MultiPolygon':
                feature.geometry.coordinates.forEach((polygon: [number, number][][]) => {
                  polygon[0].forEach((coord: [number, number]) => {
                    bounds.extend(coord);
                  });
                });
                hasValidGeometry = true;
                break;
              default:
                console.warn('未支持的几何类型:', feature.geometry.type);
                break;
            }
          } catch (error) {
            console.warn('处理要素几何时出错:', error);
          }
        }
      });

      if (hasValidGeometry) {
        // 检查边界是否有效
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        if (sw.lng !== ne.lng || sw.lat !== ne.lat) {
          map.fitBounds(bounds, {
            padding: 50,
            maxZoom: 16
          });
          window.$message?.success(`已缩放到图层 ${layerTitle}`);
          return;
        }
      }
    }

    // 如果没有要素数据，尝试使用渲染的图层边界
    const renderedFeatures = map.queryRenderedFeatures({
      layers: node.layers.map(layer => layer.id)
    });

    if (renderedFeatures && renderedFeatures.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      let hasValidGeometry = false;

      renderedFeatures.forEach(feature => {
        if (feature.geometry && feature.geometry.type === 'Point') {
          bounds.extend(feature.geometry.coordinates as [number, number]);
          hasValidGeometry = true;
        }
      });

      if (hasValidGeometry) {
        map.fitBounds(bounds, {
          padding: 50,
          maxZoom: 16
        });
        window.$message?.success(`已缩放到图层 ${layerTitle}`);
        return;
      }
    }

    // 最后的回退方案：使用默认的缩放级别
    window.$message?.info(`无法确定图层 ${layerTitle} 的范围，已设置为默认视图`);
    map.easeTo({
      center: [115.43530389617354, 7.325620166519911],
      zoom: 8
    });
  } catch (error) {
    console.error('缩放到图层时出错:', error);
    window.$message?.error('缩放到图层失败');
  }
}

onMounted(async () => {
  if (mapContainer.value) {
    map = new mapboxgl.Map({
      container: mapContainer.value,
      style: 'mapbox://styles/mapbox/standard',
      center: [115.43530389617354, 7.325620166519911],
      zoom: 3.6,
      language: 'zh-Hans'
    });

    const scale = new mapboxgl.ScaleControl({
      maxWidth: 100,
      unit: 'metric'
    });

    map.addControl(scale, 'bottom-right');
    // 不再添加原有的导航控件，使用水平控制栏中的控件
    map.addControl(draw, 'top-left');

    // 添加框选功能按钮
    addBoxZoomControls();

    setTimeout(() => {
      // 创建水平控制栏并重新排列控件
      createHorizontalControlBar();
      
      // 调试：检查所有控件是否存在
      console.log('检查控件存在情况:');
      console.log('比例尺控件:', document.querySelector('.mapboxgl-ctrl-scale'));
      console.log('绘制控件:', document.querySelector('.mapboxgl-ctrl-top-left'));
      console.log('框选控件:', (window as any).boxZoomControls);
      console.log('水平控制栏:', document.querySelector('.horizontal-control-bar'));

      // 比例尺样式
      const scaleControl = document.querySelector('.mapboxgl-ctrl-scale');
      if (scaleControl) {
        // 移除父容器的原有定位
        const parentControl = scaleControl.parentElement as HTMLElement;
        if (parentControl) {
          parentControl.style.position = 'absolute';
          parentControl.style.left = '50%';
          parentControl.style.transform = 'translateX(-50%)';
          parentControl.style.bottom = '80px';
          parentControl.style.right = 'auto';
        }

        scaleControl.classList.add(
          'h-7', // height
          'bg-white', // 白色背景
          'bg-opacity-50', // 透明度
          'leading-5', // line-height
          'text-center', // text-align: center
          'text-sm', // 字体大小
          'font-medium', // 字重
          'text-gray-900', // 文字颜色
          'transition-all', // 透明度过渡动画
          'duration-50', // 动画时长
          'px-2', // 水平内边距
          'py-1', // 垂直内边距
          'rounded-sm', // 圆角
          'border-b-2', // 底部边框
          'border-l-0', // 左侧边框
          'border-r-0', // 右侧边框
          'border-black', // 黑色边框
          'relative', // 相对定位，用于伪元素
          'whitespace-nowrap', // 防止文字换行
          'overflow-hidden', // 隐藏溢出内容
          'text-ellipsis', // 文字过长时显示省略号
          'min-w-0', // 最小宽度为0，配合文字省略
          'z-20' // 高层级
        );

        // 线段样式的刻度标记
        const style = document.createElement('style');
        style.textContent = `
          .mapboxgl-ctrl-scale::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            width: 2px;
            height: 50%;
            background-color: black;
          }
          .mapboxgl-ctrl-scale::after {
            content: '';
            position: absolute;
            right: 0;
            top: 50%;
            width: 2px;
            height: 50%;
            background-color: black;
          }
        `;
        document.head.appendChild(style);

        // 导航控件图标样式
        const navIconStyle = document.createElement('style');
        navIconStyle.textContent = `
          .mapboxgl-ctrl-zoom-in .mapboxgl-ctrl-icon,
          .mapboxgl-ctrl-zoom-out .mapboxgl-ctrl-icon {
            background-image: none !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 18px !important;
            font-weight: bold !important;
            color: #374151 !important;
          }
          
          .mapboxgl-ctrl-zoom-in .mapboxgl-ctrl-icon::before {
            content: '+' !important;
          }
          
          .mapboxgl-ctrl-zoom-out .mapboxgl-ctrl-icon::before {
            content: '−' !important;
          }
          /* 保留原生罗盘箭头与旋转行为，不做覆盖 */
        `;
        document.head.appendChild(navIconStyle);
      }

      // 导航控件样式 - 右上角，避开聊天框
      const navControl = document.querySelector('.mapboxgl-ctrl-top-right') as HTMLElement;
      if (navControl) {
        navControl.style.right = '350px';
        navControl.style.top = '5px';
        navControl.style.display = 'block';
        navControl.style.position = 'absolute';

        const navGroup = navControl.querySelector('.mapboxgl-ctrl-group');
        if (navGroup) {
          navGroup.classList.add(
            'shadow-lg', // 大阴影
            'rounded-lg', // 大圆角
            'border', // 边框
            'border-gray-200', // 边框颜色
            'bg-white', // 白色背景
            'overflow-hidden' // 确保内容不溢出圆角
          );

          // 导航按钮添加样式和图标
          const navButtons = navGroup.querySelectorAll('button');
          navButtons.forEach((button, index) => {
            button.classList.add(
              'bg-white', // 白色背景
              'hover:bg-gray-100', // 悬停效果
              'transition-colors', // 颜色过渡动画
              'duration-200', // 动画时长
              'border-0', // 移除默认边框
              'p-1', // 内边距
              'flex', // flex布局
              'items-center', // 垂直居中
              'justify-center', // 水平居中
              'w-8', // 固定宽度
              'h-8', // 固定高度
              'text-lg', // 图标大小
              'font-bold', // 粗体
              'text-gray-700' // 图标颜色
            );

          // 手动添加图标内容（仅缩放按钮）。罗盘按钮保持原生箭头与旋转行为。
          if (index === 0) {
              // 放大按钮
              button.innerHTML = '+';
              button.title = '放大';
            } else if (index === 1) {
              // 缩小按钮
              button.innerHTML = '−';
              button.title = '缩小';
          }
          });
        }
      }

      // 绘制控件样式
      const drawControl = document.querySelector('.mapboxgl-ctrl-top-left') as HTMLElement;
      if (drawControl) {
        drawControl.style.left = '360px';
        drawControl.style.top = '5px';
        const drawGroup = drawControl.querySelector('.mapboxgl-ctrl-group');
        if (drawGroup) {
          drawGroup.classList.add(
            'shadow-lg', // 大阴影
            'rounded-lg', // 大圆角
            'border', // 边框
            'border-gray-200', // 边框颜色
            'bg-white', // 白色背景
            'overflow-hidden' // 内容不溢出圆角
          );

          // 按钮样式
          const buttons = drawGroup.querySelectorAll('button');
          buttons.forEach(button => {
            button.classList.add(
              'bg-white', // 白色背景
              'hover:bg-gray-100', // 悬停效果
              'transition-colors', // 颜色过渡动画
              'duration-200', // 动画时长
              'border-0', // 移除默认边框
              'p-1', // 内边距
              'flex', // flex布局
              'items-center', // 垂直居中
              'justify-center' // 水平居中
            );
          });
        }
      }
    }, 100);

    // 添加绘制控件事件监听
    map.on('draw.selectionchange', () => {
      if (suppressSelectionOnContext.value) {
        console.log('右键阶段，忽略 selectionchange');
        return;
      }
      const selected = draw.getSelected();
      selectedDrawFeatures.value = selected.features;
      lastStableSelected.value = [...selected.features];
      console.log('选中绘制要素（稳定快照已更新）:', selected.features);
    });

    // 监听地图上的右键事件
    map.on('contextmenu', handleDrawContextMenu);
    
    // 点击地图其他地方关闭右键菜单
    map.on('click', closeDrawContextMenu);
    
    // 捕获阶段拦截容器上的右键按下/抬起，防止 Draw 在右键时改写选择（保留左键多选的结果）
    const containerEl = map.getCanvasContainer();
    if (containerEl) {
      const onPointerDownCapture = (evt: PointerEvent) => {
        if (evt.button === 2) {
          suppressSelectionOnContext.value = true;
          evt.stopPropagation();
        }
      };
      const onMouseDownCapture = (evt: MouseEvent) => {
        if (evt.button === 2) {
          suppressSelectionOnContext.value = true;
          evt.stopPropagation();
        }
      };
      const onPointerUpCapture = (evt: PointerEvent) => {
        if (evt.button === 2) {
          // 阻止右键抬起触发的选择逻辑
          evt.stopPropagation();
        }
      };
      const onMouseUpCapture = (evt: MouseEvent) => {
        if (evt.button === 2) {
          evt.stopPropagation();
        }
      };
      const onContextMenuCapture = (evt: MouseEvent) => {
        // 右键菜单阶段也维持抑制标志，避免迟到的 selectionchange 覆盖
        suppressSelectionOnContext.value = true;
      };
      containerEl.addEventListener('pointerdown', onPointerDownCapture, true);
      containerEl.addEventListener('mousedown', onMouseDownCapture, true);
      containerEl.addEventListener('pointerup', onPointerUpCapture, true);
      containerEl.addEventListener('mouseup', onMouseUpCapture, true);
      containerEl.addEventListener('contextmenu', onContextMenuCapture, true);
    }

    // 比例尺自动隐藏
    let scaleHideTimer: NodeJS.Timeout | null = null;

    const showScale = () => {
      const scaleControl = document.querySelector('.mapboxgl-ctrl-scale') as HTMLElement;
      if (scaleControl) {
        scaleControl.classList.remove('opacity-0');
        scaleControl.classList.add('opacity-100');

        // 清除之前的定时器
        if (scaleHideTimer) {
          clearTimeout(scaleHideTimer);
        }

        // 3秒后隐藏
        scaleHideTimer = setTimeout(() => {
          scaleControl.classList.remove('opacity-100');
          scaleControl.classList.add('opacity-0');
        }, 500);
      }
    };

    // 监听地图缩放事件
    map.on('zoom', showScale);
    map.on('zoomstart', showScale);
    map.on('zoomend', showScale);

    // 初始显示比例尺
    setTimeout(showScale, 500);

    // 捕获资源加载错误（如瓦片404/500），给出一次性提示
    map.on('error', (e: any) => {
      const status = e?.error?.status;
      const sourceId = e?.sourceId as string | undefined;
      const isTileError =
        e?.resourceType === 'tile' || /getMVT|getRasterTile/.test(String(e?.error?.url || e?.error?.message || ''));
      if (isTileError && sourceId && (status === 404 || status === 500 || status === 0)) {
        if (!warnedSourceIds.has(sourceId)) {
          warnedSourceIds.add(sourceId);
          window.$message?.warning('该图层数据未就绪或不可用');
        }
      }
    });

    // 测试API连接
    try {
      const response = await fetch('http://localhost:8765/api/v0/node/layerNode/test');
      const healthStatus = await response.text();
      console.log('API健康检查:', healthStatus);
    } catch (error) {
      console.error('API连接失败:', error);
    }

    try {
      const rootData = await initData();
      dataTree.value = rootData.children || [];
      treeData.value = convertToTreeData(dataTree.value);
      const layerList = extractNodes(dataTree.value);

      scene = new MapScene(map);
      scene.loadFromData(layerList);
      console.log('地图场景初始化完成:', scene);
    } catch (error) {
      console.error('初始化地图数据失败:', error);
      dataTree.value = [];
      treeData.value = [];
    }
  }
});


</script>

<template>
  <div id="map-container" ref="mapContainer">
    <ADrawer
      :body-style="{
        height: '100%',
        background: '#1B2232',
        padding: 0,
        overflow: 'hidden'
      }"
      width="350"
      placement="left"
      :mask="false"
      :closable="false"
      :open="drawerOpen"
      :get-container="false"
    >
      <div class="h-full flex flex-col">
        <div class="h-[55%] flex flex-col">
          <div
            class="h-10 flex items-center rounded-lg from-[#0d8bc1] to-[#30b4ee] bg-gradient-to-r p-4 text-base font-bold"
          >
            <DatabaseFilled class="mr-1.5" />
            数据目录
          </div>
          <div class="flex-1 overflow-auto p-4">
            <ACard
              class="h-full border-0 card-wrapper bg-tech-1"
              :body-style="{
                height: '100%',
                'box-sizing': 'border-box',
                padding: '15px',
                overflow: 'auto'
              }"
            >
              <SimpleScrollbar>
                <ATree default-expand-all :auto-expand-parent="true" :show-line="true" :tree-data="treeData">
                  <template #title="{ key, title, isLayer }">
                    <ADropdown :trigger="['contextmenu']">
                      <span>{{ title }}</span>
                      <template #overlay>
                        <AMenu v-if="isLayer" @click="({ key: menuKey }) => onContextMenuClick(key as string, title)">
                          <AMenuItem key="1">添加至图层</AMenuItem>
                        </AMenu>
                      </template>
                    </ADropdown>
                  </template>
                </ATree>
              </SimpleScrollbar>
            </ACard>
          </div>
        </div>
        <div class="min-h-0 flex flex-col flex-1">
          <div
            class="h-10 flex items-center rounded-lg from-[#0d8bc1] to-[#30b4ee] bg-gradient-to-r p-4 text-base font-bold"
          >
            <AppstoreFilled class="mr-1.5" />
            图层管理
          </div>
          <div class="flex-1 overflow-auto p-4">
            <ACard
              class="h-full border-0 card-wrapper bg-tech-1"
              :body-style="{
                height: '100%',
                'box-sizing': 'border-box',
                padding: '15px',
                overflow: 'auto'
              }"
            >
              <SimpleScrollbar>
                <ATree
                  v-model:expanded-keys="expandedKeys"
                  v-model:checked-keys="checkedKeys"
                  checkable
                  default-expand-all
                  draggable
                  :tree-data="layerTreeData"
                  :allow-drop="({ dropPosition }) => dropPosition !== 0"
                  @drop="onLayerTreeDrop"
                  @check="onLayerCheckClick"
                >
                  <template #title="{ title, key }">
                    <ADropdown :trigger="['contextmenu']">
                      <span v-if="key === '0-0-1-0'" style="color: #1890ff">{{ title }}</span>
                      <span v-else>{{ title }}</span>
                      <template #overlay>
                        <AMenu
                          @click="
                            ({ key: menuKey }) => onLayerContextMenuClick(menuKey as string, key as string, title)
                          "
                        >
                          <AMenuItem key="viewAttributes">
                            <div class="flex items-center gap-2">
                              <TableOutlined />
                              查看属性表
                            </div>
                          </AMenuItem>
                          <AMenuItem key="zoomToLayer">
                            <div class="flex items-center gap-2">
                              <ZoomInOutlined />
                              缩放到图层
                            </div>
                          </AMenuItem>
                          <AMenuDivider />
                          <AMenuItem key="removeLayer" class="text-red-500">
                            <div class="flex items-center gap-2">
                              <DeleteOutlined />
                              移除图层
                            </div>
                          </AMenuItem>
                        </AMenu>
                      </template>
                    </ADropdown>
                  </template>
                </ATree>
                <AEmpty v-if="layerTreeData && layerTreeData.length === 0" class="absolute top-10 h-full w-full" />
              </SimpleScrollbar>
            </ACard>
          </div>
        </div>
      </div>
    </ADrawer>

    <div class="absolute">
      <AButton type="primary" @click="showDrawer">Open</AButton>
    </div>
    <div class="absolute right-5 h-4/5 w-1/5" style="top: 10%; z-index: 1200;">
      <ChatBox
        ref="chatBoxRef"
        @on-load-nodes-by-name="onLoadNodesByName"
        @start-draw="startDraw"
        @finish-draw="finishDraw"
        @add-analysis-results="addAnalysisResults"
      />
    </div>

    <!-- 属性表组件 -->
    <AttributeTableWindow
      v-model:visible="attributeTableVisible"
      :layer-id="selectedLayerId"
      :layer-name="selectedLayerName"
      :map="map"
      :scene="scene"
      :local-data="selectedLayerId === 'draw_features'
        ? Array.from(drawFeaturesData.values()).flat()
        : (selectedLayerId.startsWith('draw_') ? drawFeaturesData.get(selectedLayerId) : undefined)"
      :z-index="2000"
      @closed="attributeTableVisible = false"
      @request-focus="() => {}"
    />

    <!-- 绘制要素右键菜单 -->
    <div
      v-if="drawContextMenuVisible"
      class="fixed bg-white rounded-lg shadow-xl border border-gray-200 z-[3000] min-w-[150px]"
      :style="{ left: `${drawContextMenuPosition.x}px`, top: `${drawContextMenuPosition.y}px` }"
    >
      <div
        class="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2 text-gray-700"
        @click="handleAddFeatureToLayer"
      >
        <PlusOutlined class="text-gray-600" />
        <span class="text-gray-700">添加到图层</span>
      </div>
    </div>

    <!-- 要素命名对话框 -->
    <AModal
      v-model:open="featureNameModalVisible"
      title="添加要素到图层"
      :mask-closable="false"
      :z-index="3001"
      @ok="confirmAddFeatureToLayer"
      @cancel="cancelAddFeatureToLayer"
    >
      <div class="py-4">
        <AFormItem label="要素名称" :label-col="{ span: 5 }" :wrapper-col="{ span: 16 }">
          <AInput
            v-model:value="featureName"
            placeholder="请输入要素名称"
            @keyup.enter="confirmAddFeatureToLayer"
          />
        </AFormItem>
        <div v-if="selectedDrawFeatures.length > 0" class="mt-4 text-gray-600">
          <p>已选中 {{ selectedDrawFeatures.length }} 个要素</p>
          <ul class="mt-2 text-sm">
            <li v-for="(feature, index) in selectedDrawFeatures" :key="index">
              {{ index + 1 }}. {{ feature.geometry.type }}
              <span v-if="feature.geometry.type === 'Point'">
                ({{ feature.geometry.coordinates[0].toFixed(4) }}, {{ feature.geometry.coordinates[1].toFixed(4) }})
              </span>
            </li>
          </ul>
        </div>
      </div>
    </AModal>
  </div>
</template>

<style lang="scss">
#map-container {
  position: relative;
  width: 100%;
  height: 100%;
}

/* 隐藏 Mapbox 水印和版权信息 */
.mapboxgl-ctrl-attrib {
  display: none !important;
}

.mapboxgl-ctrl-logo {
  display: none !important;
}

/* 重置控件默认样式，让 JavaScript 控制定位 */
#map-container .mapboxgl-ctrl-bottom-right,
#map-container .mapboxgl-ctrl-top-left {
  position: absolute !important;
}

/* 绘制控件选中状态样式 */
.horizontal-control-bar .mapbox-gl-draw_ctrl-draw-btn.active {
  background-color: #007cbf !important;
  color: white !important;
}

.ant-tree {
  background: none;
  color: rgb(255, 255, 255);
}

.ant-tree-node-selected {
  background: rgb(128, 156, 182) !important;
}
</style>
