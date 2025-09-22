<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import mapboxgl from 'mapbox-gl';
import { SimpleScrollbar } from '@sa/materials';
import type { AntTreeNodeCheckedEvent, AntTreeNodeDropEvent, TreeProps } from 'ant-design-vue/es/tree';
import { AppstoreFilled, DatabaseFilled, DeleteOutlined, TableOutlined, ZoomInOutlined, PlusOutlined } from '@ant-design/icons-vue';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import type { Feature, GeoJsonProperties, Geometry } from 'geojson';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { MapboxSearchBox } from '@mapbox/search-js-web';
import MapScene from '@/utils/mapUtils/mapModels/MapScene';
import { fetchGetLayerTree } from '@/service/api';
import AttributeTableWindow from '@/components/common/AttributeTableWindow.vue';
import { explodeFeatureToPartFeatures } from '@/utils/mapUtils/featureUtils';
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

// 最近一次搜索结果的标记（显示坐标）
// 由自定义覆盖取代内置 Marker
// let searchResultMarker: mapboxgl.Marker | null = null;
let searchOverlayEl: HTMLElement | null = null;
let searchOverlayCenter: mapboxgl.LngLatLike | null = null;

// const mapContainer = ref<HTMLElement | null>(null);
const mapViewEl = ref<HTMLElement | null>(null);
const chatBoxRef = ref<ChatBoxExpose | null>(null);
const dataTree = ref<Map.LayerData[]>([]);
const treeData = ref<TreeProps['treeData']>([]);
const layerTreeData = ref<TreeProps['treeData']>([]);

const expandedKeys = ref<string[]>([]);
const checkedKeys = ref<string[]>([]);

const drawerOpen = ref(true);

const drawData = ref<Feature<Geometry, GeoJsonProperties> | null>(null);

// 路由
const router = useRouter();

// 自定义右键菜单状态
const customContextMenuVisible = ref(false);
const customContextMenuPosition = ref({ x: 0, y: 0 });
const currentContextNode = ref<any>(null);

// 图层管理右键菜单状态
const layerContextMenuVisible = ref(false);
const layerContextMenuPosition = ref({ x: 0, y: 0 });
const currentContextLayer = ref<{ key: string; title: string } | null>(null);

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

// 处理右键菜单显示
const handleRightClickMenu = (event: MouseEvent, nodeData: any) => {
  console.log('Right click detected on:', nodeData.title, event);
  event.preventDefault();
  event.stopPropagation();
  
  // 设置菜单位置
  customContextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  };
  
  // 设置当前节点和显示菜单
  currentContextNode.value = nodeData;
  customContextMenuVisible.value = true;
  
  console.log('Custom context menu shown for:', nodeData.title);
};

// 处理数据目录右键菜单点击
const handleDataMenuClick = (menuKey: string) => {
  console.log(`数据目录菜单点击: ${menuKey} - ${currentContextNode.value?.title}`);
  
  if (menuKey === 'addToLayer' && currentContextNode.value) {
    // 调用添加图层的功能
    onContextMenuClick(currentContextNode.value.key, currentContextNode.value.title);
  }
  
  // 隐藏菜单
  customContextMenuVisible.value = false;
  currentContextNode.value = null;
};

// 点击其他地方隐藏菜单
const hideCustomContextMenu = () => {
  customContextMenuVisible.value = false;
  currentContextNode.value = null;
};

// 处理图层管理右键菜单显示
const handleLayerRightClick = (event: MouseEvent, layerKey: string, layerTitle: string) => {
  console.log('Layer right click detected:', layerKey, layerTitle, event);
  event.preventDefault();
  event.stopPropagation();
  
  // 设置菜单位置
  layerContextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  };
  
  // 设置当前图层和显示菜单
  currentContextLayer.value = { key: layerKey, title: layerTitle };
  layerContextMenuVisible.value = true;
  
  console.log('Layer context menu shown for:', layerTitle);
};

// 处理图层管理右键菜单点击
const handleLayerMenuClick = (menuKey: string) => {
  console.log(`图层管理菜单点击: ${menuKey} - ${currentContextLayer.value?.title}`);
  
  if (currentContextLayer.value) {
    // 调用原有的图层菜单处理函数
    onLayerContextMenuClick(menuKey, currentContextLayer.value.key, currentContextLayer.value.title);
  }
  
  // 隐藏菜单
  layerContextMenuVisible.value = false;
  currentContextLayer.value = null;
};

// 点击其他地方隐藏图层菜单
const hideLayerContextMenu = () => {
  layerContextMenuVisible.value = false;
  currentContextLayer.value = null;
};

const onContextMenuClick = (id: string, title: string) => {
  console.log(`右键添加图层: ${id} - ${title}`);
  console.log('当前scene对象:', scene);
  console.log('当前数据树:', dataTree.value);
  console.log('当前树形数据:', treeData.value);

  // 查找节点数据以确定类型
  const findNodeInTree = (nodes: Map.LayerData[], targetId: string): Map.LayerData | null => {
    for (const node of nodes) {
      if (node.id === targetId) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        const found = findNodeInTree(node.children, targetId);
        if (found) return found;
      }
    }
    return null;
  };

  const nodeData = findNodeInTree(dataTree.value, id);
  console.log(`找到节点数据:`, nodeData);

  // 如果是 static 类型的资源，直接打开文件而不是作为图层
  if (nodeData?.category === 'static') {
    const fileUrl = `http://localhost:8765/api/v0/resource/static/getStaticFileByte/${id}`;
    window.open(fileUrl, '_blank');
    window.$message?.success(`正在打开文件: ${title}`);
    return;
  }

  // 检查scene是否已初始化
  if (!scene) {
    console.error('MapScene未初始化');
    window.$message?.error('地图场景未初始化，请稍后再试');
    return;
  }

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

  // 检查节点是否存在于scene中
  const existingNode = scene.findNodeById(id);
  console.log(`在scene中查找节点 ${id}:`, existingNode);

  // 加载图层节点
  const loadSuccess = scene.loadNode(id);
  console.log(`loadNode(${id}) 结果:`, loadSuccess);
  
  if (loadSuccess) {
    console.log(`图层 ${id} 加载成功，添加到图层管理面板`);
    // 添加到图层管理面板
    layerTreeData.value = [{ title, key: id, children: [] }, ...(layerTreeData.value || [])];
    // 设置为勾选状态
    checkedKeys.value.push(id);
    window.$message?.success(`已添加图层: ${title}`);
  } else {
    console.log(`图层 ${id} 加载失败或已经加载过`);
    // 即使加载失败，也可能是因为已经加载过，尝试添加到面板
    const node = scene.findNodeById(id);
    if (node) {
      console.log(`节点 ${id} 已存在，添加到图层管理面板`);
      layerTreeData.value = [{ title, key: id, children: [] }, ...(layerTreeData.value || [])];
      checkedKeys.value.push(id);
      // 确保图层可见
      scene.openNode(id);
      window.$message?.success(`已添加图层: ${title}`);
    } else {
      console.error(`节点 ${id} 不存在于scene中`);
      console.log('scene中的所有节点:', scene.nodes.map(n => ({ id: n.id, name: n.name, active: n.active })));
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
    // 任何存在 usage 的节点都视为可加载图层（包括 static 类型）
    if (node.usage !== null) {
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
    isLayer: layer.usage !== null,
    category: layer.category
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
        // 从勾选状态中移除
        checkedKeys.value = checkedKeys.value.filter(key => key !== layerKey);
        // 如果属性窗在看这个层，关闭
        if (selectedLayerId.value === layerKey) {
          attributeTableVisible.value = false;
          selectedLayerId.value = '';
          selectedLayerName.value = '';
        }
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

  // 为所有选中的要素创建带属性的新要素（Multi* 拆分为逐部件要素）
  const featuresWithAttributes = selectedDrawFeatures.value.flatMap((originalFeature, index) => {
    const nameWithIndex = selectedDrawFeatures.value.length > 1 
      ? `${featureName.value}_${index + 1}` 
      : featureName.value;
    return explodeFeatureToPartFeatures(originalFeature, nameWithIndex);
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
    left: calc(50% - 200px);
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    border-radius: 8px;
    padding: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1500;
  `;

  // 获取现有控件
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
  if (mapViewEl.value || document.getElementById('map-view')) {
    // 兼容合并后 DOM 变更：兜底解析容器
    const resolveContainer = (): HTMLElement => {
      let el = mapViewEl.value as HTMLElement | null;
      if (!el) el = document.getElementById('map-view') as HTMLElement | null;
      if (!el) {
        const parent = document.getElementById('map-container');
        el = document.createElement('div');
        el.id = 'map-view';
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.position = 'relative';
        parent?.prepend(el);
      }
      return el!;
    };

    const mapContainerEl = resolveContainer();

    map = new mapboxgl.Map({
      container: mapContainerEl,
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

    // 若容器高度异常（< 200px），强制拉伸到视口高度，避免父级未设置高度导致画布为0
    try {
      const host = document.getElementById('map-container') as HTMLElement | null;
      const view = document.getElementById('map-view') as HTMLElement | null;
      if (view && view.clientHeight < 200) {
        if (host) host.style.height = '100vh';
        view.style.minHeight = '400px';
      }
      // 动态占满可视区域（扣除头部等已占高度）
      const adjustContainerHeight = () => {
        const h = document.getElementById('map-container') as HTMLElement | null;
        const v = document.getElementById('map-view') as HTMLElement | null;
        if (!h || !v) return;
        const top = h.getBoundingClientRect().top;
        const height = Math.max(300, window.innerHeight - top);
        h.style.height = height + 'px';
        v.style.height = height + 'px';
        v.style.width = '100%';
        map.resize();
      };
      adjustContainerHeight();
      window.addEventListener('resize', adjustContainerHeight);
      onUnmounted(() => window.removeEventListener('resize', adjustContainerHeight));
    } catch {}

    // 防止父容器高度/可见性变化导致画布尺寸为0，自动适配
    try {
      const el = mapViewEl.value as HTMLElement || document.getElementById('map-view') as HTMLElement;
      const ensureResize = () => {
        if (el.clientWidth > 0 && el.clientHeight > 0) {
          map.resize();
          return true;
        }
        return false;
      };
      // 初次尝试
      ensureResize();
      // 观察尺寸变化
      const ro = new ResizeObserver(() => map.resize());
      ro.observe(el);
      // 若初始为0，短暂轮询直至可用
      const t = setInterval(() => {
        if (ensureResize()) clearInterval(t);
      }, 200);
      onUnmounted(() => {
        try { ro.disconnect(); } catch {}
        clearInterval(t);
      });
    } catch {}

    // 添加搜索框控件（右上角）
    try {
      const searchBox = new MapboxSearchBox();
      // 访问令牌与选项
      (searchBox as any).accessToken = mapboxgl.accessToken;
      ;(searchBox as any).options = {
        language: 'zh-Hans',
        limit: 10,
        proximity: map.getCenter()
      };
      // 明确的输入提示（覆盖组件默认“搜索”占位符）
      (searchBox as any).placeholder = '输入地名/地址/POI,或经度,纬度';

      // 绑定到地图并启用坐标输入（反向检索）
      try {
        (searchBox as any).mapboxgl = mapboxgl;
        (searchBox as any).marker = { color: '#007cbf' };
        (searchBox as any).bindMap?.(map);
        (searchBox as any).componentOptions = {
          // 启用坐标查询（反向检索），并统一为经度,纬度
          allowReverse: true,
          flipCoordinates: false,
          flyTo: false
        };
      } catch (bindErr) {
        console.warn('搜索控件绑定地图失败，但不影响基本搜索:', bindErr);
      }

      map.addControl(searchBox as any, 'top-right');

      // 坐标直达：当输入为 “经度,纬度” 或 “经度 纬度” 时，直接跳转并标注，不调用远端搜索
      const updateSearchOverlay = () => {
        if (!searchOverlayEl || !searchOverlayCenter) return;
        const p = map.project(searchOverlayCenter as any);
        // 以容器左上角为参考，避免受外层滚动影响
        searchOverlayEl.style.left = '0px';
        searchOverlayEl.style.top = '0px';
        searchOverlayEl.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      };

      const removeSearchOverlay = () => {
        if (searchOverlayEl) {
          searchOverlayEl.remove();
          searchOverlayEl = null;
          searchOverlayCenter = null;
          map.off('move', updateSearchOverlay);
          map.off('zoom', updateSearchOverlay);
          map.off('resize', updateSearchOverlay);
        }
      };

      const ensureOverlay = (center: [number, number]) => {
        searchOverlayCenter = new mapboxgl.LngLat(center[0], center[1]);
        if (!searchOverlayEl) {
          searchOverlayEl = document.createElement('div');
          searchOverlayEl.style.position = 'absolute';
          searchOverlayEl.style.zIndex = '1700'; // 设置为比搜索框更高的层级
          // 不影响地图交互
          searchOverlayEl.style.pointerEvents = 'none';
          searchOverlayEl.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:auto;">
              <div style="width:14px;height:14px;border-radius:50%;background:#007cbf;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.3)"></div>
              <div style="position:relative;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:8px 28px 8px 10px;box-shadow:0 4px 12px rgba(0,0,0,.15);font-size:13px;line-height:1.4;white-space:nowrap;color:#111;min-width:140px;">
                <button data-role="close" title="关闭" style="position:absolute;top:4px;right:4px;width:18px;height:18px;border:none;background:transparent;color:#666;cursor:pointer;font-size:16px;line-height:18px;padding:0;">×</button>
                经度: <b data-role="lng"></b><br/>
                纬度: <b data-role="lat"></b>
              </div>
            </div>`;
          const host = document.getElementById('map-view');
          host?.appendChild(searchOverlayEl);
          map.on('move', updateSearchOverlay);
          map.on('zoom', updateSearchOverlay);
          map.on('resize', updateSearchOverlay);
          // 绑定关闭按钮
          const closeBtn = searchOverlayEl.querySelector('[data-role="close"]') as HTMLElement | null;
          closeBtn?.addEventListener('click', (ev: MouseEvent) => {
            ev.stopPropagation();
            removeSearchOverlay();
          });
        }
        const lngEl = searchOverlayEl!.querySelector('[data-role="lng"]') as HTMLElement;
        const latEl = searchOverlayEl!.querySelector('[data-role="lat"]') as HTMLElement;
        lngEl.textContent = center[0].toFixed(6);
        latEl.textContent = center[1].toFixed(6);
        updateSearchOverlay();
      };

      const handleCoordJump = (lon: number, lat: number) => {
        if (Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90) {
          const center: [number, number] = [lon, lat];
          map.flyTo({ center, zoom: 5 });
          // 使用画布上的自定义覆盖，避免滚动容器影响
          ensureOverlay(center);
        }
      };

      // 按下 Enter 时，如果完整为“经度,纬度”则跳转并标注
      const inputEl = (searchBox as any).input as HTMLInputElement | undefined;
      inputEl?.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'Enter') return;
        const val = inputEl.value || '';
        const match = val.match(/^\s*(-?\d+(?:\.\d+)?)\s*[ ,\t]+\s*(-?\d+(?:\.\d+)?)\s*$/);
        if (match) {
          const lon = parseFloat(match[1]);
          const lat = parseFloat(match[2]);
          handleCoordJump(lon, lat);
        }
      });

      // 选择结果后飞到位置
      (searchBox as any).addEventListener('retrieve', (ev: any) => {
        const detail = ev?.detail;
        const feature = detail?.features?.[0] || detail?.feature || detail;
        const bbox = feature?.properties?.bbox || feature?.bbox;
        const coords = feature?.geometry?.coordinates || feature?.properties?.coordinates;
        if (bbox && Array.isArray(bbox) && bbox.length === 4) {
          const bounds = new mapboxgl.LngLatBounds([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
          map.fitBounds(bounds, { padding: 40, maxZoom: 16 });
          const c = bounds.getCenter();
          ensureOverlay([c.lng, c.lat]);
        } else if (Array.isArray(coords) && coords.length >= 2) {
          const center: [number, number] = [Number(coords[0]), Number(coords[1])];
          map.flyTo({ center, zoom: 13 });
          ensureOverlay(center);
        }
      });

      // 调整右上角控件容器位置，避免与聊天框重叠
      setTimeout(() => {
        const topRight = document.querySelector('#map-view .mapboxgl-ctrl-top-right') as HTMLElement | null;
        if (topRight) {
          // 确保整个搜索控件容器的z-index足够高
          topRight.style.zIndex = '1500';
          topRight.style.position = 'absolute';
          topRight.style.top = '10px'; // 与水平控制栏保持完全相同的top值
          topRight.style.right = 'calc(20% + 50px)';
          topRight.style.left = 'auto';
          topRight.style.display = 'flex';
          topRight.style.alignItems = 'center'; // 垂直居中对齐
          topRight.style.height = 'auto'; // 自动高度
        }
        const searchEl = document.querySelector('#map-view .mapbox-search-box') as HTMLElement | null;
        if (searchEl) {
          searchEl.style.width = '300px';
          searchEl.style.maxWidth = '300px';
          searchEl.style.position = 'relative'; // 相对于父容器定位
          searchEl.style.right = 'auto';
          searchEl.style.top = 'auto';
          searchEl.style.left = '0';
          searchEl.style.zIndex = '1500'; // 大幅提升层级，确保在ChatBox (200) 之上
          
          // 动态设置搜索下拉列表的z-index
          const setDropdownZIndex = () => {
            // 更全面的选择器列表，包括可能的各种变体
            const dropdownSelectors = [
              // Mapbox搜索框相关
              '.mapbox-search-listbox',
              '.mapbox-search-suggestions', 
              '.mapbox-search-results',
              '.mapbox-search-box-results',
              '[role="listbox"]',
              '[data-testid="suggestions"]',
              '[data-testid="results"]',
              '.suggestions',
              '.mapbox-search-listbox-container',
              '.mapbox-search-results-list',
              // 通用下拉选择器
              '.dropdown',
              '.dropdown-menu',
              '.autocomplete',
              '.autocomplete-suggestions',
              '.search-suggestions',
              '.search-results',
              // 可能的Mapbox自定义类名
              '[class*="mapbox"][class*="search"]',
              '[class*="suggestion"]',
              '[class*="result"]'
            ];
            
            // 在搜索框内查找
            dropdownSelectors.forEach(selector => {
              try {
                const elements = searchEl.querySelectorAll(selector);
                elements.forEach((el: any) => {
                  el.style.zIndex = '1600';
                  el.style.position = 'relative';
                });
              } catch (e) {
                // 忽略无效选择器错误
              }
            });
            
            // 在全局查找搜索相关的下拉列表
            dropdownSelectors.forEach(selector => {
              try {
                const globalElements = document.querySelectorAll(selector);
                globalElements.forEach((el: any) => {
                  // 检查是否与我们的搜索框相关
                  const rect = searchEl.getBoundingClientRect();
                  const elRect = el.getBoundingClientRect();
                  
                  // 如果元素位置在搜索框附近，认为是搜索下拉列表
                  if (Math.abs(elRect.left - rect.left) < 100 && 
                      elRect.top >= rect.bottom - 50) {
                    el.style.zIndex = '1600';
                    el.style.position = 'absolute';
                  }
                });
              } catch (e) {
                // 忽略错误
              }
            });
            
            // 特别处理：直接在document body查找可能的下拉列表
            const bodyDropdowns = document.querySelectorAll('div[style*="position"], div[class*="dropdown"], div[class*="suggestion"], div[class*="result"]');
            bodyDropdowns.forEach((el: any) => {
              try {
                const rect = searchEl.getBoundingClientRect();
                const elRect = el.getBoundingClientRect();
                
                // 检查位置关系：在搜索框下方且水平位置接近
                if (elRect.top >= rect.bottom - 20 && 
                    Math.abs(elRect.left - rect.left) < 150 &&
                    elRect.width > 100) {
                  el.style.zIndex = '1600';
                  console.log('设置搜索下拉列表z-index:', el);
                }
              } catch (e) {
                // 忽略错误
              }
            });
          };
          
          // 立即设置一次
          setDropdownZIndex();
          
          // 多重监听机制，确保下拉列表出现时也有正确的z-index
          
          // 1. 监听搜索框本身的变化
          const searchObserver = new MutationObserver(setDropdownZIndex);
          searchObserver.observe(searchEl, { 
            childList: true, 
            subtree: true, 
            attributes: true,
            attributeFilter: ['class', 'style']
          });
          
          // 2. 监听整个document body的变化（捕获动态创建的下拉列表）
          const bodyObserver = new MutationObserver(() => {
            setTimeout(setDropdownZIndex, 10); // 小延迟确保DOM更新完成
          });
          bodyObserver.observe(document.body, {
            childList: true,
            subtree: true
          });
          
          // 3. 监听搜索框的focus和input事件
          const searchInput = searchEl.querySelector('input');
          if (searchInput) {
            searchInput.addEventListener('focus', () => {
              setTimeout(setDropdownZIndex, 100);
            });
            searchInput.addEventListener('input', () => {
              setTimeout(setDropdownZIndex, 200);
            });
          }
          
          // 4. 定期检查（作为最后保障）
          const intervalCheck = setInterval(setDropdownZIndex, 1000);
          
          // 清理函数
          const cleanup = () => {
            searchObserver.disconnect();
            bodyObserver.disconnect();
            clearInterval(intervalCheck);
          };
          
          // 在页面卸载时清理
          window.addEventListener('beforeunload', cleanup);
        }
      }, 150);
    } catch (e) {
      console.error('添加搜索框失败:', e);
    }

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
          'bg-opacity-50', 
          'leading-5', 
          'text-center', 
          'text-sm', 
          'font-medium', 
          'text-gray-900', 
          'transition-all', 
          'duration-50', 
          'px-2', 
          'py-1', 
          'rounded-sm', 
          'border-b-2', 
          'border-l-0', 
          'border-r-0', 
          'border-black', 
          'relative', 
          'whitespace-nowrap', 
          'overflow-hidden', 
          'text-ellipsis', 
          'min-w-0', 
          'z-20' 
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

        const navGroup = navControl.querySelector('.mapboxgl-ctrl-group');
        if (navGroup) {
          navGroup.classList.add(
            'shadow-lg', 
            'rounded-lg', 
            'border', 
            'border-gray-200', 
            'bg-white', 
            'overflow-hidden' 
          );

          // 导航按钮添加样式和图标
          const navButtons = navGroup.querySelectorAll('button');
          navButtons.forEach((button, index) => {
            button.classList.add(
              'bg-white', 
              'hover:bg-gray-100', 
              'transition-colors', 
              'duration-200', 
              'border-0', 
              'p-1', 
              'flex', 
              'items-center', 
              'justify-center', 
              'w-8', 
              'h-8', 
              'text-lg', 
              'font-bold', 
              'text-gray-700' 
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
            'shadow-lg', 
            'rounded-lg', 
            'border', 
            'border-gray-200', 
            'bg-white', 
            'overflow-hidden' 
          );

          // 按钮样式
          const buttons = drawGroup.querySelectorAll('button');
          buttons.forEach(button => {
            button.classList.add(
              'bg-white', 
              'hover:bg-gray-100', 
              'transition-colors', 
              'duration-200', 
              'border-0', 
              'p-1', 
              'flex', 
              'items-center', 
              'justify-center' 
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
      console.log('开始初始化地图数据...');
      const rootData = await initData();
      console.log('API返回的根数据:', rootData);
      
      dataTree.value = rootData.children || [];
      console.log('设置的dataTree:', dataTree.value);
      
      treeData.value = convertToTreeData(dataTree.value);
      console.log('转换的treeData:', treeData.value);
      
      const layerList = extractNodes(dataTree.value);
      console.log('提取的可加载图层列表:', layerList);

      scene = new MapScene(map);
      scene.loadFromData(layerList);
      console.log('地图场景初始化完成:', scene);
      console.log('scene中的节点数量:', scene.nodes.length);
      console.log('scene中的节点列表:', scene.nodes.map(n => ({ id: n.id, name: n.name, type: n.type })));
    } catch (error) {
      console.error('初始化地图数据失败:', error);
      dataTree.value = [];
      treeData.value = [];
    }
  }
});

// 打开布局视图
const openLayoutView = () => {
  router.push('/layout');
};


</script>

<template>
  <div id="map-container">
    <div id="map-view" ref="mapViewEl" class="absolute inset-0"></div>
    
    <!-- 布局视图按钮 -->
    <div class="absolute top-4 right-4 z-[100]">
      <ATooltip title="打开布局视图" placement="left">
        <AButton 
          type="primary" 
          size="large"
          class="shadow-lg hover:shadow-xl transition-all duration-200"
          @click="openLayoutView"
        >
          <template #icon>
            <IconifyIcon icon="material-symbols:print-outline" class="text-lg" />
          </template>
          布局出图
        </AButton>
      </ATooltip>
    </div>
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
                  <template #title="nodeData">
                    <!-- 图层节点：支持右键菜单 -->
                    <div v-if="nodeData.isLayer" class="relative">
                      <div 
                        
                        :title="`右键查看${nodeData.category === 'static' ? '文件' : '图层'}操作：${nodeData.title}`"
                        @contextmenu.prevent="(e) => handleRightClickMenu(e, nodeData)"
                      >
                        <span class="text-white font-medium opacity-100">{{ nodeData.title }}</span>
                        <IconifyIcon 
                          v-if="nodeData.category === 'static'" 
                          icon="material-symbols:description-outline" 
                          class="ml-1 text-xs text-white opacity-100" 
                        />
                        <IconifyIcon 
                          v-else 
                          icon="material-symbols:layers-outline" 
                          class="ml-1 text-xs text-white opacity-100" 
                        />
                      </div>
                    </div>
                    
                    <!-- 目录节点：普通显示 -->
                    <span v-else class="text-white opacity-100">
                      <IconifyIcon icon="material-symbols:folder-outline" class="mr-1 text-white opacity-100" />
                      {{ nodeData.title }}
                    </span>
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
                    <div class="relative">
                      <div 
                        @contextmenu.prevent="(e) => handleLayerRightClick(e, key as string, title)"
                        
                      >
                        <span v-if="key === '0-0-1-0'" style="color: #1890ff">{{ title }}</span>
                        <span v-else>{{ title }}</span>
                      </div>
                    </div>
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
    <div class="absolute right-5 h-4/5 w-1/5" style="top: 10%; z-index: 200;">
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

    <!-- 数据目录自定义右键菜单 -->
    <div
      v-if="customContextMenuVisible"
      class="fixed bg-white rounded-lg shadow-xl border border-gray-200 z-[3000] min-w-[150px]"
      :style="{ left: `${customContextMenuPosition.x}px`, top: `${customContextMenuPosition.y}px` }"
      @click.stop
    >
      <div
        class="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2 text-gray-700"
        @click="handleDataMenuClick('addToLayer')"
      >
        <IconifyIcon 
          v-if="currentContextNode?.category === 'static'" 
          icon="material-symbols:open-in-new" 
          class="text-blue-500" 
        />
        <IconifyIcon 
          v-else 
          icon="material-symbols:add-circle-outline" 
          class="text-blue-500" 
        />
        <span class="text-gray-700">
          {{ currentContextNode?.category === 'static' ? '打开文件' : '添加到图层' }}
        </span>
      </div>
    </div>

    <!-- 点击其他地方隐藏菜单的遮罩 -->
    <div
      v-if="customContextMenuVisible"
      class="fixed inset-0 z-[2999]"
      @click="hideCustomContextMenu"
    ></div>

    <!-- 图层管理自定义右键菜单 -->
    <div
      v-if="layerContextMenuVisible"
      class="fixed bg-white rounded-lg shadow-xl border border-gray-200 z-[3001] min-w-[150px]"
      :style="{ left: `${layerContextMenuPosition.x}px`, top: `${layerContextMenuPosition.y}px` }"
      @click.stop
    >
      <div
        class="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2 text-gray-700"
        @click="handleLayerMenuClick('viewAttributes')"
      >
        <TableOutlined class="text-blue-500" />
        <span class="text-gray-700">查看属性表</span>
      </div>
      <div
        class="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2 text-gray-700"
        @click="handleLayerMenuClick('zoomToLayer')"
      >
        <ZoomInOutlined class="text-blue-500" />
        <span class="text-gray-700">缩放到图层</span>
      </div>
      <div class="border-t border-gray-200 my-1"></div>
      <div
        class="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2 text-red-500"
        @click="handleLayerMenuClick('removeLayer')"
      >
        <DeleteOutlined class="text-red-500" />
        <span class="text-red-500">移除图层</span>
      </div>
    </div>

    <!-- 点击其他地方隐藏图层菜单的遮罩 -->
    <div
      v-if="layerContextMenuVisible"
      class="fixed inset-0 z-[3000]"
      @click="hideLayerContextMenu"
    ></div>

    <!-- 要素命名对话框 -->
    <AModal
      v-model:open="featureNameModalVisible"
      title="添加要素到图层"
      :mask-closable="false"
      :z-index="2001"
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

#map-view {
  position: absolute;
  inset: 0;
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

/* 去掉比例尺控件两侧的边框（隐藏伪元素竖线） */
.mapboxgl-ctrl-scale::before,
.mapboxgl-ctrl-scale::after {
  display: none !important;
  content: none !important;
}

/* 搜索框下拉列表层级设置 - 全面覆盖 */
.mapbox-search-box .mapbox-search-listbox,
.mapbox-search-box .mapbox-search-suggestions,
.mapbox-search-box .mapbox-search-results,
.mapbox-search-box .mapbox-search-box-results,
.mapbox-search-box [role="listbox"],
.mapbox-search-box [data-testid="suggestions"],
.mapbox-search-box [data-testid="results"],
.mapbox-search-box .suggestions,
.mapbox-search-box .mapbox-search-listbox-container,
.mapbox-search-box .mapbox-search-results-list,
.mapbox-search-box .dropdown,
.mapbox-search-box .dropdown-menu,
.mapbox-search-box .autocomplete,
.mapbox-search-box .autocomplete-suggestions,
.mapbox-search-box .search-suggestions,
.mapbox-search-box .search-results,
/* 全局搜索相关下拉列表 */
div[class*="mapbox"][class*="search"],
div[class*="suggestion"],
div[class*="result"],
div[data-testid*="suggestion"],
div[data-testid*="result"],
div[role="listbox"],
/* 可能的动态创建的下拉列表 */
body > div[style*="position: absolute"]:not(.attr-win),
body > div[style*="position: fixed"]:not(.attr-win) {
  z-index: 1600 !important;
  position: relative !important;
}

/* 特别针对可能出现在body根级别的搜索下拉列表 */
body > div:has(.mapbox-search-listbox),
body > div:has([role="listbox"]),
body > div:has([data-testid*="suggestion"]) {
  z-index: 1600 !important;
}



/* 使用更高的特异性来覆盖内联样式 */
#map-view div[style*="position: absolute"]:not(.attr-win),
#map-view div[style*="position: fixed"]:not(.attr-win) {
  z-index: 1600 !important;
}

/* 强制调整搜索控件容器位置 - 与水平控制栏平行 */
#map-view .mapboxgl-ctrl-top-right {
  position: absolute !important;
  top: 10px !important; /* 与水平控制栏完全相同的top值 */
  right: calc(20% + 50px) !important;
  left: auto !important;
  z-index: 1500 !important;
  display: flex !important;
  align-items: center !important; /* 垂直居中对齐，与水平控制栏一致 */
  height: auto !important; /* 自动高度 */
}

/* 搜索框相对于容器定位 */
#map-view .mapbox-search-box {
  position: relative !important;
  width: 300px !important;
  max-width: 300px !important;
  left: 0 !important;
  right: auto !important;
  top: auto !important;
}
</style>
