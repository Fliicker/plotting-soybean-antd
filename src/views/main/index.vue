<script setup lang="ts">
import { onMounted, ref } from 'vue';
import mapboxgl from 'mapbox-gl';
import { SimpleScrollbar } from '@sa/materials';
import type { AntTreeNodeCheckedEvent, AntTreeNodeDropEvent, TreeProps } from 'ant-design-vue/es/tree';
import { AppstoreFilled, DatabaseFilled } from '@ant-design/icons-vue';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import type { Feature, GeoJsonProperties, Geometry } from 'geojson';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import MapScene from '@/utils/mapUtils/mapModels/MapScene';
import { fetchGetLayerTree } from '@/service/api';
import ChatBox from './modules/chat-box.vue';
import type { ChatBoxExpose } from './modules/chat-box.vue';

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

  const dropKey = info.node.key; // 目标节点key
  const dragKey = info.dragNode.key; // 拖拽节点key
  const dropPos = info.dropPosition; // 放置位置
  const data = [...(layerTreeData.value || [])]; // 当前树数据

  const dragIndex = data.findIndex(item => item?.key === dragKey);
  const dropIndex = data.findIndex(item => item?.key === dropKey); // Attention: 拖到最顶端时无法变成-1（仍然为0）

  // 更改图层顺序
  const layerId = String(dragKey); // 拖拽图层的 ID
  const beforeId = dropPos !== -1 ? String(data[dropPos - 1]?.key) : null; // 目标图层的 ID（下一个图层的 ID
  console.log(info.dragNode.title, data[dropPos - 1]?.title);
  scene.moveNode(layerId, beforeId);

  // 移除拖拽节点
  const [removed] = data.splice(dragIndex, 1);

  let newIndex = dropIndex;
  if (dropPos === -1) {
    newIndex = 0;
  } else {
    newIndex = dropIndex >= dragIndex ? dropIndex : dropIndex + 1;
  }
  console.log(dropPos);
  data.splice(newIndex, 0, removed);

  // 更新图层树
  layerTreeData.value = [...data];
};

const onLayerCheckClick = (_: any, e: AntTreeNodeCheckedEvent) => {
  const nodeId = String(e.node.key);
  console.log(`图层管理面板勾选状态变化: ${nodeId}, 勾选: ${e.checked}`);

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
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(draw, 'top-left');

    setTimeout(() => {
      // 调试：检查所有控件是否存在
      console.log('检查控件存在情况:');
      console.log('比例尺控件:', document.querySelector('.mapboxgl-ctrl-scale'));
      console.log('导航控件:', document.querySelector('.mapboxgl-ctrl-top-right'));
      console.log('绘制控件:', document.querySelector('.mapboxgl-ctrl-top-left'));

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
          .mapboxgl-ctrl-zoom-out .mapboxgl-ctrl-icon,
          .mapboxgl-ctrl-compass .mapboxgl-ctrl-icon {
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
          
          .mapboxgl-ctrl-compass .mapboxgl-ctrl-icon::before {
            content: '⊙' !important;
          }
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

            // 手动添加图标内容
            if (index === 0) {
              // 放大按钮
              button.innerHTML = '+';
              button.title = '放大';
            } else if (index === 1) {
              // 缩小按钮
              button.innerHTML = '−';
              button.title = '缩小';
            } else if (index === 2) {
              // 重置方向按钮
              button.innerHTML = '⊙';
              button.title = '重置方向';
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
                    <span v-if="key === '0-0-1-0'" style="color: #1890ff">{{ title }}</span>
                    <template v-else>{{ title }}</template>
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
    <div class="absolute right-5 top-1/10 h-4/5 w-1/5">
      <ChatBox
        ref="chatBoxRef"
        @on-load-nodes-by-name="onLoadNodesByName"
        @start-draw="startDraw"
        @finish-draw="finishDraw"
        @add-analysis-results="addAnalysisResults"
      />
    </div>
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
#map-container .mapboxgl-ctrl-top-left,
#map-container .mapboxgl-ctrl-top-right {
  position: absolute !important;
}

.ant-tree {
  background: none;
  color: rgb(255, 255, 255);
}

.ant-tree-node-selected {
  background: rgb(128, 156, 182) !important;
}
</style>
