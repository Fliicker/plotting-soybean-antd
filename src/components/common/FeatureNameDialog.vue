<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Feature, GeoJsonProperties, Geometry } from 'geojson';

interface Props {
  visible: boolean;
  feature: Feature<Geometry, GeoJsonProperties> | null;
}

interface Emits {
  (e: 'confirm', name: string, feature: Feature<Geometry, GeoJsonProperties>): void;
  (e: 'cancel'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const featureName = ref('');
const loading = ref(false);

// 监听对话框显示，重置表单
watch(() => props.visible, (visible) => {
  if (visible && props.feature) {
    // 根据要素类型生成默认名称
    const type = getFeatureTypeName(props.feature);
    const timestamp = new Date().toLocaleTimeString();
    featureName.value = `${type}_${timestamp}`;
  } else {
    featureName.value = '';
  }
});

// 获取要素类型名称
const getFeatureTypeName = (feature: Feature<Geometry, GeoJsonProperties>): string => {
  switch (feature.geometry.type) {
    case 'Point':
      return '点要素';
    case 'LineString':
      return '线要素';
    case 'Polygon':
      return '面要素';
    case 'MultiPoint':
      return '多点要素';
    case 'MultiLineString':
      return '多线要素';
    case 'MultiPolygon':
      return '多面要素';
    default:
      return '要素';
  }
};

// 确认处理
const handleConfirm = async () => {
  if (!featureName.value.trim()) {
    window.$message?.warning('请输入要素名称');
    return;
  }
  
  if (!props.feature) {
    window.$message?.error('没有选中的要素');
    return;
  }

  loading.value = true;
  
  try {
    emit('confirm', featureName.value.trim(), props.feature);
  } catch (error) {
    console.error('添加要素到图层失败:', error);
    window.$message?.error('添加要素到图层失败');
  } finally {
    loading.value = false;
  }
};

// 取消处理
const handleCancel = () => {
  emit('cancel');
};

// 获取要素信息摘要
const getFeatureSummary = (feature: Feature<Geometry, GeoJsonProperties> | null): string => {
  if (!feature) return '';
  
  const type = feature.geometry.type;
  
  switch (type) {
    case 'Point':
      const point = feature.geometry as any;
      return `坐标: [${point.coordinates[0].toFixed(6)}, ${point.coordinates[1].toFixed(6)}]`;
    
    case 'LineString':
      const line = feature.geometry as any;
      return `包含 ${line.coordinates.length} 个点`;
    
    case 'Polygon':
      const polygon = feature.geometry as any;
      return `包含 ${polygon.coordinates[0].length - 1} 个顶点`;
    
    default:
      return `几何类型: ${type}`;
  }
};
</script>

<template>
  <AModal
    :open="visible"
    title="添加要素到图层"
    :confirm-loading="loading"
    @ok="handleConfirm"
    @cancel="handleCancel"
  >
    <div class="feature-name-dialog">
      <div class="feature-info">
        <h4>要素信息</h4>
        <p class="feature-type">类型: {{ getFeatureTypeName(feature) }}</p>
        <p class="feature-summary">{{ getFeatureSummary(feature) }}</p>
      </div>
      
      <div class="name-input-section">
        <AFormItem label="图层名称" required>
          <AInput
            v-model:value="featureName"
            placeholder="请输入图层名称"
            :max-length="50"
            show-count
            @press-enter="handleConfirm"
          />
        </AFormItem>
        
        <div class="tips">
          <AIcon type="info-circle" />
          <span>该要素将作为新图层添加到图层管理面板中，并生成对应的属性表</span>
        </div>
      </div>
    </div>
  </AModal>
</template>

<style scoped>
.feature-name-dialog {
  padding: 16px 0;
}

.feature-info {
  margin-bottom: 24px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.feature-info h4 {
  margin: 0 0 12px 0;
  color: #374151;
  font-size: 16px;
  font-weight: 600;
}

.feature-type,
.feature-summary {
  margin: 8px 0;
  color: #6b7280;
  font-size: 14px;
}

.name-input-section {
  margin-bottom: 16px;
}

.tips {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 12px;
  background: #eff6ff;
  border-radius: 6px;
  border: 1px solid #bfdbfe;
}

.tips span {
  font-size: 13px;
  color: #1d4ed8;
  line-height: 1.4;
}

.tips .anticon {
  color: #3b82f6;
  margin-top: 1px;
}
</style>
