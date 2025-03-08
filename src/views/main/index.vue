<script setup lang="ts">
import { onMounted, ref } from 'vue';
import mapboxgl from 'mapbox-gl';
import MapScene from '@/utils/mapUtils/mapModels/MapScene';
import { fetchGetLayerTree } from '@/service/api';

mapboxgl.accessToken = 'pk.eyJ1IjoiZmxpY2tlcjA1NiIsImEiOiJjbGd4OXM1c3cwOWs3M21ta2RiMDhoczVnIn0.lE8NriBf_g3RZWCusw_mZA';

let map: mapboxgl.Map;

const mapContainer = ref<HTMLElement | null>(null);
const dataTree = ref<Map.LayerData[]>([]);

const open = ref(true);

const selectedKeys = ref<string[]>([]);
const checkedKeys = ref<string[]>([]);

const showDrawer = () => {
  open.value = true;
};

const onClose = () => {
  open.value = false;
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
    const layerList = extractNodes(dataTree.value);
    const scene = new MapScene(map);
    scene.loadFromData(layerList);
    console.log(scene);
  }
});
</script>

<template>
  <div id="map-container" ref="mapContainer">
    <ADrawer class="absolute" placement="left" :mask="false" :closable="false" :open="open" :get-container="false">
      <template #extra>
        <AButton @click="onClose">Cancel</AButton>
      </template>
      <ACard title="数据目录" class="h-1/2 card-wrapper bg-tech-1">
        <Atree
          v-model:selected-keys="selectedKeys"
          v-model:checked-keys="checkedKeys"
          checkable
          default-expand-all
          :auto-expand-parent="true"
          :show-line="true"
          :field-names="{ title: 'label', key: 'id' }"
        ></Atree>
      </ACard>
      <ACard title="图层列表" class="mt-1/10 h-2/5 card-wrapper bg-tech-1"></ACard>
    </ADrawer>
    <div class="absolute">
      <AButton type="primary" @click="showDrawer">Open</AButton>
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
</style>
