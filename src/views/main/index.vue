<script setup lang="ts">
import { onMounted, ref } from 'vue';
import mapboxgl from 'mapbox-gl';
import { SimpleScrollbar } from '@sa/materials';
import type { AntTreeNodeCheckedEvent, AntTreeNodeDropEvent, TreeProps } from 'ant-design-vue/es/tree';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import type { Feature, GeoJsonProperties, Geometry } from 'geojson';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import MapScene from '@/utils/mapUtils/mapModels/MapScene';
import { fetchGetLayerTree } from '@/service/api';
import ChatBox from './modules/chat-box.vue';
import type { ChatBoxExpose } from './modules/chat-box.vue';

mapboxgl.accessToken = 'pk.eyJ1IjoiZmxpY2tlcjA1NiIsImEiOiJjbGd4OXM1c3cwOWs3M21ta2RiMDhoczVnIn0.lE8NriBf_g3RZWCusw_mZA';

let map: mapboxgl.Map;
const draw: MapboxDraw = new MapboxDraw({
  displayControlsDefault: false
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

const showDrawer = () => {
  drawerOpen.value = true;
};

const onContextMenuClick = (id: string, title: string) => {
  if (scene?.loadNode(id)) {
    layerTreeData.value = [{ title, key: id, children: [] }, ...(layerTreeData.value || [])];
    checkedKeys.value.push(id);
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
  if (e.checked) {
    scene?.openNode(String(e.node.key));
  } else {
    scene?.closeNode(String(e.node.key));
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
  const data = await fetchGetLayerTree();
  return replaceProperties(data);
};

// 提取树中每个节点
const extractNodes = (tree: Map.LayerData[]): Map.LayerData[] => {
  const leafNodes: Map.LayerData[] = [];

  function traverse(node: Map.LayerData) {
    if (!node.children || node.children.length === 0) {
      if (node.category !== 'static') {
        leafNodes.push({ ...node });
      }
    } else {
      node.children.forEach((child: Map.LayerData) => traverse(child));
    }
  }

  tree.forEach(root => traverse(root));

  return leafNodes;
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
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [120.5174, 23.66552],
      zoom: 7,
      language: 'zh-Hans'
    });

    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
    map.addControl(draw);

    dataTree.value = (await initData()).children;
    treeData.value = convertToTreeData(dataTree.value);
    const layerList = extractNodes(dataTree.value);

    scene = new MapScene(map);
    scene.loadFromData(layerList);
    console.log(scene);
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
        <div class="h-[60%] flex flex-col">
          <div
            class="h-10 flex items-center rounded-lg from-[#0d8bc1] to-[#30b4ee] bg-gradient-to-r p-4 text-base font-bold"
          >
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

.mapboxgl-ctrl-bottom-left,
.mapboxgl-ctrl-bottom-right {
  display: none !important;
}

.ant-tree {
  background: none;
  color: rgb(255, 255, 255);
}

.ant-tree-node-selected {
  background: rgb(128, 156, 182) !important;
}
</style>
