<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ColumnsType } from 'ant-design-vue/es/table';
import { ExportOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons-vue';

interface AttributeTableProps {
  visible: boolean;
  layerId: string;
  layerName: string;
  map: mapboxgl.Map | null;
  scene?: any; // MapScene instance
}

interface FeatureProperties {
  [key: string]: any;
  __feature_id__: number;
}

const props = defineProps<AttributeTableProps>();
const emit = defineEmits<{ 'update:visible': [value: boolean]; 'feature-selected': [feature: any] }>();

const visible = computed({
  get: () => props.visible,
  set: value => emit('update:visible', value)
});

const loading = ref(false);
const features = ref<any[]>([]);
const searchField = ref<string>('');
const searchValue = ref<string>('');
const currentPage = ref(1);
const pageSize = ref(50);

// 统计
const totalFeatures = computed(() => features.value.length);

// 可选字段
const availableFields = computed(() => {
  if (features.value.length === 0) return [] as string[];
  const first = features.value[0];
  if (!first.properties) return [] as string[];
  return Object.keys(first.properties).filter(k => k !== '__feature_id__');
});

// 表格数据（将Feature转换为普通对象）
const tableData = computed(() =>
  features.value.map((feature, index) => ({
    ...feature.properties,
    __feature_id__: index,
    __original_feature__: feature
  }))
);

// 过滤
const filteredData = computed(() => {
  if (!searchField.value || !searchValue.value) return tableData.value;
  return tableData.value.filter(row => {
    const v = row[searchField.value];
    return v != null && String(v).toLowerCase().includes(searchValue.value.toLowerCase());
  });
});

// 列配置
const columns = computed<ColumnsType>(() => {
  if (availableFields.value.length === 0) return [];
  return availableFields.value.map(field => ({
    title: field,
    dataIndex: field,
    key: field,
    width: 160,
    ellipsis: true,
    sorter: (a: any, b: any) => {
      const av = a[field];
      const bv = b[field];
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av ?? '').localeCompare(String(bv ?? ''));
    },
    customRender: ({ text }: { text: any }) => formatCellValue(text)
  }));
});

// 去重逻辑（解决 querySourceFeatures 引起的重复）
function dedupeFeatures(list: any[]): any[] {
  const seen = new Set<string>();
  const unique: any[] = [];
  for (const f of list) {
    const prop = f?.properties || {};
    const id = f?.id ?? prop.ogc_fid ?? prop.OGC_FID ?? prop.OBJECTID ?? prop.objectid ?? prop.id ?? prop.fid;
    let key = '';
    if (id != null) {
      key = `id:${String(id)}`;
    } else {
      // 兜底：用geometry类型 + 第一坐标 + 少量属性组合（避免大对象）
      const geom = f?.geometry?.type || 'Unknown';
      const coord = Array.isArray(f?.geometry?.coordinates)
        ? JSON.stringify((f.geometry.coordinates as any)[0]).slice(0, 80)
        : 'na';
      const name = prop.name ?? prop.NAME ?? prop.label ?? '';
      key = `${geom}:${coord}:${name}`;
    }
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(f);
    }
  }
  return unique;
}

// 加载要素
const loadFeatures = async () => {
  if (!props.map || !props.layerId) return;
  loading.value = true;
  features.value = [];
  try {
    let list: any[] = [];

    if (props.scene && typeof props.scene.queryLayerFeatures === 'function') {
      list = props.scene.queryLayerFeatures(props.layerId);
    }

    if (list.length === 0) {
      try {
        const fromSource = props.map.querySourceFeatures(props.layerId);
        if (fromSource?.length) list = fromSource;
      } catch {}
    }

    if (list.length === 0) {
      try {
        const layerIds = [`${props.layerId}0`, `${props.layerId}1`, `${props.layerId}2`, props.layerId].filter(id =>
          props.map?.getLayer(id as string)
        );
        for (const lid of layerIds) {
          const rendered = props.map!.queryRenderedFeatures({ layers: [lid as string] });
          if (rendered?.length) {
            list = rendered;
            break;
          }
        }
      } catch {}
    }

    features.value = dedupeFeatures(list);
  } catch (e) {
    console.error('查询图层要素失败:', e);
    features.value = [];
    window.$message?.error('查询图层要素失败');
  } finally {
    loading.value = false;
  }
};

const refreshData = () => loadFeatures();
const handleSearch = () => {
  currentPage.value = 1;
};

const formatCellValue = (value: any): string => {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
};

const onRowClick = (record: FeatureProperties) => {
  const feature = (record as any).__original_feature__;
  if (feature) emit('feature-selected', feature);
};

function handlePageChange(page: number) {
  currentPage.value = page;
}
function handlePageSizeChange(_page: number, size: number) {
  pageSize.value = size;
  currentPage.value = 1;
}

// 导出 CSV
function exportData() {
  if (filteredData.value.length === 0) {
    window.$message?.warning('没有数据可导出');
    return;
  }
  const headers = availableFields.value.join(',');
  const rows = filteredData.value.map(row =>
    availableFields.value
      .map(field => {
        const value = row[field];
        if (typeof value === 'string' && value.includes(',')) return `"${value.replace(/"/g, '""')}"`;
        return value ?? '';
      })
      .join(',')
  );
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${props.layerName}_属性表.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  window.$message?.success('导出成功');
}

// 打开时加载
watch(
  () => props.visible,
  v => {
    if (v) {
      searchField.value = '';
      searchValue.value = '';
      currentPage.value = 1;
      pageSize.value = 50;
      loadFeatures();
    }
  }
);

watch(
  () => props.layerId,
  () => {
    if (props.visible) loadFeatures();
  }
);
</script>

<template>
  <AModal
    v-model:open="visible"
    :title="`${layerName} - 属性表`"
    width="80%"
    :footer="null"
    :destroy-on-close="true"
    :mask="false"
    class="attribute-table-modal"
  >
    <div class="attribute-table-wrapper">
      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="left">
          <AButton type="primary" size="small" @click="refreshData">
            <template #icon>
              <ReloadOutlined />
            </template>
            刷新
          </AButton>
          <AButton size="small" @click="exportData">
            <template #icon>
              <ExportOutlined />
            </template>
            导出
          </AButton>
          <div class="count">共 {{ totalFeatures }} 个要素</div>
        </div>
        <div class="right">
          <ASelect v-model:value="searchField" placeholder="选择字段" style="width: 140px" size="small">
            <ASelectOption v-for="field in availableFields" :key="field" :value="field">
              {{ field }}
            </ASelectOption>
          </ASelect>
          <AInput
            v-model:value="searchValue"
            placeholder="搜索值"
            size="small"
            style="width: 220px"
            @change="handleSearch"
          >
            <template #suffix>
              <SearchOutlined />
            </template>
          </AInput>
        </div>
      </div>

      <!-- 表格 -->
      <ATable
        :columns="columns"
        :data-source="filteredData"
        :loading="loading"
        row-key="__feature_id__"
        size="small"
        :scroll="{ y: '60vh', x: 'max-content' }"
        :pagination="{
          total: filteredData.length,
          current: currentPage,
          pageSize: pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100', '200'],
          showQuickJumper: true,
          showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
          onChange: handlePageChange,
          onShowSizeChange: handlePageSizeChange
        }"
        @row="onRowClick"
      >
        <template v-for="field in availableFields" :key="field" #[field]="{ text }">
          <span :title="String(text)">{{ formatCellValue(text) }}</span>
        </template>
      </ATable>
    </div>
  </AModal>
</template>

<style scoped>
.attribute-table-modal :deep(.ant-modal-body) {
  padding: 16px;
}

.attribute-table-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.toolbar .left {
  display: flex;
  gap: 8px;
  align-items: center;
}
.toolbar .right {
  display: flex;
  gap: 8px;
  align-items: center;
}
.count {
  color: #6b7280;
  font-size: 12px;
}

.attribute-table-modal :deep(.ant-table-thead > tr > th) {
  background-color: #fafafa;
  font-weight: 600;
}

.attribute-table-modal :deep(.ant-table-tbody > tr:hover > td) {
  background-color: #e6f7ff;
}
</style>
