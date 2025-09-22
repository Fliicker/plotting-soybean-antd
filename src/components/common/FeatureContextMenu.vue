<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
import type { Feature, GeoJsonProperties, Geometry } from 'geojson';

interface Props {
  visible: boolean;
  x: number;
  y: number;
  selectedFeature: Feature<Geometry, GeoJsonProperties> | null;
}

interface Emits {
  (e: 'close'): void;
  (e: 'addToLayer', feature: Feature<Geometry, GeoJsonProperties>): void;
  (e: 'deleteFeature', feature: Feature<Geometry, GeoJsonProperties>): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 计算菜单样式
const menuStyle = computed<CSSProperties>(() => ({
  position: 'fixed',
  left: `${props.x}px`,
  top: `${props.y}px`,
  zIndex: 9999,
  display: props.visible ? 'block' : 'none'
}));

// 获取要素类型
const getFeatureType = (feature: Feature<Geometry, GeoJsonProperties> | null): string => {
  if (!feature) return '';
  
  switch (feature.geometry.type) {
    case 'Point':
      return '点';
    case 'LineString':
      return '线';
    case 'Polygon':
      return '面';
    case 'MultiPoint':
      return '多点';
    case 'MultiLineString':
      return '多线';
    case 'MultiPolygon':
      return '多面';
    default:
      return '要素';
  }
};

// 菜单项点击处理
const handleAddToLayer = () => {
  if (props.selectedFeature) {
    emit('addToLayer', props.selectedFeature);
  }
  emit('close');
};

const handleDelete = () => {
  if (props.selectedFeature) {
    emit('deleteFeature', props.selectedFeature);
  }
  emit('close');
};

//

// 点击菜单外部关闭
const handleClickOutside = (event: Event) => {
  if (props.visible) {
    event.stopPropagation();
    emit('close');
  }
};
</script>

<template>
  <div v-if="visible" class="feature-context-menu-overlay" @click="handleClickOutside">
    <div class="feature-context-menu" :style="menuStyle" @click.stop>
      <div class="menu-header">
        <span class="feature-type">{{ getFeatureType(selectedFeature) }}要素</span>
      </div>
      
      <div class="menu-items">
        <div class="menu-item" @click="handleAddToLayer">
          <AIcon type="plus-circle" />
          <span>添加到图层</span>
        </div>
        
        <div class="menu-item delete-item" @click="handleDelete">
          <AIcon type="delete" />
          <span>删除要素</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.feature-context-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9998;
  background: transparent;
}

.feature-context-menu {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border: 1px solid #e5e7eb;
  min-width: 160px;
  overflow: hidden;
}

.menu-header {
  padding: 8px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.feature-type {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

.menu-items {
  padding: 4px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  font-size: 14px;
  color: #374151;
}

.menu-item:hover {
  background: #f3f4f6;
}

.menu-item.delete-item {
  color: #dc2626;
}

.menu-item.delete-item:hover {
  background: #fef2f2;
}
</style>
