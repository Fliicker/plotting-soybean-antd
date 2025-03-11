<script setup lang="ts">
import { onMounted, ref } from 'vue';
import mapboxgl from 'mapbox-gl';
import { SimpleScrollbar } from '@sa/materials';
import type { DataNode } from 'ant-design-vue/es/tree';
import MapScene from '@/utils/mapUtils/mapModels/MapScene';
import { fetchGetLayerTree } from '@/service/api';
import ChatBox from './modules/chat-box.vue';

mapboxgl.accessToken = 'pk.eyJ1IjoiZmxpY2tlcjA1NiIsImEiOiJjbGd4OXM1c3cwOWs3M21ta2RiMDhoczVnIn0.lE8NriBf_g3RZWCusw_mZA';

let map: mapboxgl.Map;

const mapContainer = ref<HTMLElement | null>(null);
const dataTree = ref<Map.LayerData[]>([]);
const treeData = ref<DataNode[]>([]);

const open = ref(true);

const expandedKeys = ref<string[]>([]);

const showDrawer = () => {
  open.value = true;
};

const onClose = () => {
  open.value = false;
};

const onContextMenuClick = (treeKey: string, menuKey: string | number) => {
  console.log(`treeKey: ${treeKey}, menuKey: ${menuKey}`);
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

const convertToTreeData = (layers: Map.LayerData[]): DataNode[] => {
  return layers.map(layer => ({
    key: layer.id,
    title: layer.name_cn,
    children: layer.children ? convertToTreeData(layer.children) : undefined,
    isLeaf: !layer.children || layer.children.length === 0
  }));
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

    dataTree.value = (await initData()).children;
    treeData.value = convertToTreeData(dataTree.value);
    const layerList = extractNodes(dataTree.value);
    console.log(dataTree.value);

    const scene = new MapScene(map);
    scene.loadFromData(layerList);
    console.log(scene);
  }
});
</script>

<template>
  <div id="map-container" ref="mapContainer">
    <ADrawer
      class="absolute"
      :body-style="{ background: '#1B2232' }"
      width="350"
      placement="left"
      :mask="false"
      :closable="false"
      :open="open"
      :get-container="false"
    >
      <template #extra>
        <AButton @click="onClose">Cancel</AButton>
      </template>
      <ACard
        class="h-1/2 border-0 card-wrapper bg-tech-1"
        :body-style="{
          height: '100%',
          'box-sizing': 'border-box',
          padding: '15px',
          overflow: 'auto'
        }"
      >
        <SimpleScrollbar>
          <!-- @ts-ignore -->
          <ATree
            v-model:expanded-keys="expandedKeys"
            default-expand-all
            :auto-expand-parent="true"
            :show-line="true"
            :tree-data="treeData"
            :field-names="{ title: 'name_cn', key: 'id' }"
          >
            <template #title="{ key, title }">
              <ADropdown :trigger="['contextmenu']">
                <span>{{ title }}</span>
                <template #overlay>
                  <AMenu @click="({ key: menuKey }) => onContextMenuClick(key as string, menuKey)">
                    <AMenuItem key="1">添加至图层</AMenuItem>
                  </AMenu>
                </template>
              </ADropdown>
            </template>
          </ATree>
        </SimpleScrollbar>
      </ACard>
      <ACard class="mt-1/10 h-4/9 border-0 card-wrapper bg-tech-1"></ACard>
    </ADrawer>
    <div class="absolute">
      <AButton type="primary" @click="showDrawer">Open</AButton>
    </div>
    <div class="absolute right-5 top-1/10 h-4/5 w-1/5">
      <ChatBox></ChatBox>
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
