<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ColumnsType } from 'ant-design-vue/es/table';
import { fetchVectorAttributes, fetchVectorColumns, fetchVectorRowCount } from '@/service/api/map';

interface Props {
  visible: boolean;
  layerId: string;
  layerName: string;
  map?: mapboxgl.Map | null;
  scene?: any;
  zIndex?: number;
  localData?: any[]; // 本地数据（用于绘制要素）
}
const props = withDefaults(defineProps<Props>(), { zIndex: 2000 });
const emit = defineEmits<{ 'update:visible': [boolean]; closed: []; 'request-focus': [] }>();

// UI 常量
const headerHeight = 42;
const snapGap = 12; // 磁吸阈值

// 位置尺寸与状态
const position = ref({ x: 120, y: 100 });
const size = ref({ width: 1000, height: 600 });
const isMinimized = ref(false);

// 拖拽
const dragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });
function startDrag(e: MouseEvent) {
  if (isMinimized.value) return;
  dragging.value = true;
  dragOffset.value = { x: e.clientX - position.value.x, y: e.clientY - position.value.y };
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);
}
function onDrag(e: MouseEvent) {
  if (!dragging.value) return;
  position.value = { x: e.clientX - dragOffset.value.x, y: e.clientY - dragOffset.value.y };
}
function stopDrag() {
  if (!dragging.value) return;
  dragging.value = false;
  snapToEdges();
  saveState();
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
}

// 缩放
type ResizeType = 'right' | 'bottom' | 'corner';
const resizing = ref(false);
const resizeType = ref<ResizeType>('corner');
const resizeStart = ref({ x: 0, y: 0, w: 0, h: 0 });
function startResize(type: ResizeType, e: MouseEvent) {
  resizing.value = true;
  resizeType.value = type;
  resizeStart.value = { x: e.clientX, y: e.clientY, w: size.value.width, h: size.value.height };
  window.addEventListener('mousemove', onResize);
  window.addEventListener('mouseup', stopResize);
}
function onResize(e: MouseEvent) {
  if (!resizing.value) return;
  const dx = e.clientX - resizeStart.value.x;
  const dy = e.clientY - resizeStart.value.y;
  const minH = 360;
  const minW = 600;
  if (resizeType.value === 'right' || resizeType.value === 'corner')
    size.value.width = Math.max(minW, resizeStart.value.w + dx);
  if (resizeType.value === 'bottom' || resizeType.value === 'corner')
    size.value.height = Math.max(minH, resizeStart.value.h + dy);
}
function stopResize() {
  if (!resizing.value) return;
  resizing.value = false;
  snapToEdges();
  saveState();
  window.removeEventListener('mousemove', onResize);
  window.removeEventListener('mouseup', stopResize);
}

function emitFocus() {
  emit('request-focus');
}
function toggleMinimize() {
  isMinimized.value = !isMinimized.value;
  saveState();
}

// 磁吸到屏幕边缘
function snapToEdges() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x2 = position.value.x + size.value.width;
  const y2 = position.value.y + size.value.height;
  if (Math.abs(position.value.x) <= snapGap) position.value.x = 0; // 左
  if (Math.abs(position.value.y) <= snapGap) position.value.y = 0; // 上
  if (Math.abs(vw - x2) <= snapGap) position.value.x = Math.max(0, vw - size.value.width); // 右
  if (Math.abs(vh - y2) <= snapGap) position.value.y = Math.max(0, vh - size.value.height); // 下
}

// 状态持久化（按 layerId 记忆）
const storeKey = computed(() => `attrWin:${props.layerId}`);
sessionStorage.removeItem('noop'); // 占位，避免未使用 import 报错
function saveState() {
  const info = {
    x: position.value.x,
    y: position.value.y,
    w: size.value.width,
    h: size.value.height,
    minimized: isMinimized.value
  };
  try {
    localStorage.setItem(storeKey.value, JSON.stringify(info));
  } catch {}
}
function loadState() {
  try {
    const raw = localStorage.getItem(storeKey.value);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (Number.isFinite(s.x) && Number.isFinite(s.y)) position.value = { x: s.x, y: s.y };
    if (Number.isFinite(s.w) && Number.isFinite(s.h)) size.value = { width: s.w, height: s.h } as any;
    if (typeof s.minimized === 'boolean') isMinimized.value = s.minimized;
  } catch {}
}

// 对外暴露：用于父组件排列/控制
function setRect(rect: { x: number; y: number; width: number; height: number }) {
  position.value = { x: rect.x, y: rect.y };
  size.value = { width: rect.width, height: rect.height } as any;
  isMinimized.value = false;
  saveState();
}
function minimize() {
  isMinimized.value = true;
  saveState();
}
function restore() {
  isMinimized.value = false;
  saveState();
}

defineExpose({ setRect, minimize, restore });

// 数据区
const loading = ref(false);
const searchField = ref('');
const searchValue = ref('');
const currentPage = ref(1);
const pageSize = ref(50);

const totalFeatures = ref(0);
const availableFields = ref<string[]>([]);

const tableData = ref<any[]>([]); // 当前页数据
const allTableData = ref<any[]>([]); // 全部数据用于搜索

const filteredData = computed(() => {
  if (!searchField.value || !searchValue.value) {
    // 无搜索条件时，返回当前页数据
    return tableData.value;
  }
  // 有搜索条件时，从全部数据中搜索
  console.log('搜索条件:', { field: searchField.value, value: searchValue.value });
  const filtered = allTableData.value.filter(row => {
    const v = row[searchField.value];
    const match = v !== null && v !== undefined && String(v).toLowerCase().includes(searchValue.value.toLowerCase());
    return match;
  });
  console.log('全表搜索结果:', filtered.length, '行');
  return filtered;
});

const pagedData = computed(() => {
  // 如果有搜索条件，需要在前端进行分页
  if (searchField.value && searchValue.value) {
    const start = (currentPage.value - 1) * pageSize.value;
    const end = start + pageSize.value;
    return filteredData.value.slice(start, end);
  }
  // 没有搜索条件时，直接使用后端分页的数据
  return filteredData.value;
});

const columns = computed<ColumnsType>(() => {
  if (!availableFields.value.length) return [];
  return availableFields.value.map(field => ({
    title: field,
    dataIndex: field,
    key: field,
    width: 160,
    ellipsis: true,
    sorter: (a: any, b: any) => {
      const aVal = a[field];
      const bVal = b[field];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return -1;
      if (bVal == null) return 1;

      // 数字类型排序
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return aVal - bVal;
      }

      // 字符串排序
      return String(aVal).localeCompare(String(bVal), 'zh-CN');
    },
    sortDirections: ['ascend', 'descend'] as const
  }));
});

async function loadFromServer() {
  if (!props.layerId) return;
  
  // 如果是绘制要素，不调用后端API
  if (props.layerId.startsWith('draw_')) {
    console.log('绘制要素不调用后端API');
    loadFromLocal();
    return;
  }
  
  loading.value = true;
  try {
    // 每次都重新获取列名，确保数据最新
    const response = (await fetchVectorColumns(props.layerId)) as any;
    const cols = response.data || response;
    availableFields.value = (cols || []).filter((c: string) => c && c.toLowerCase() !== 'geom');

    // 确保有列名后再获取数据
    if (availableFields.value.length > 0) {
      // 总数
      const countResponse = (await fetchVectorRowCount(props.layerId)) as any;
      const count = countResponse.data || countResponse;
      totalFeatures.value = count || 0;

      // 当前页数据
      const rowsResponse = (await fetchVectorAttributes(props.layerId, {
        columns: availableFields.value,
        page: currentPage.value,
        size: pageSize.value
      })) as any;
      const rows = rowsResponse.data || rowsResponse;
      tableData.value = rows || [];

      // 如果是第一次加载且数据量不大，获取全部数据用于搜索
      if (currentPage.value === 1 && totalFeatures.value <= 1000) {
        try {
          const allRowsResponse = (await fetchVectorAttributes(props.layerId, {
            columns: availableFields.value,
            page: 1,
            size: totalFeatures.value
          })) as any;
          const allRows = allRowsResponse.data || allRowsResponse;
          allTableData.value = allRows || [];
          console.log('已加载全部数据用于搜索:', allTableData.value.length, '行');
        } catch (error) {
          console.warn('加载全部数据失败，搜索将仅限于当前页:', error);
          allTableData.value = tableData.value;
        }
      } else if (currentPage.value === 1) {
        // 数据量太大，只使用当前页数据
        allTableData.value = tableData.value;
        console.log('数据量较大，搜索仅限于当前页');
      }
    } else {
      console.warn('未获取到有效列名');
    }
  } finally {
    loading.value = false;
  }
}

function loadFromLocal() {
  if (!props.localData || props.localData.length === 0) {
    console.warn('没有本地数据或数据为空');
    loading.value = false;
    // 设置空数据
    availableFields.value = [];
    totalFeatures.value = 0;
    allTableData.value = [];
    tableData.value = [];
    return;
  }
  
  loading.value = true;
  try {
    // 从全部数据里收集列名（取并集），避免不同子层出现字段不一致导致缺列
    const fieldSet = new Set<string>();
    for (const row of props.localData) {
      Object.keys(row || {}).forEach(k => {
        if (k !== 'geom') fieldSet.add(k);
      });
    }
    availableFields.value = Array.from(fieldSet);
    
    // 设置数据
    totalFeatures.value = props.localData.length;
    allTableData.value = props.localData;
    
    // 分页数据
    const start = (currentPage.value - 1) * pageSize.value;
    const end = start + pageSize.value;
    tableData.value = props.localData.slice(start, end);
    
    console.log('已加载本地数据:', {
      总数: totalFeatures.value,
      列: availableFields.value,
      当前页数据: tableData.value.length
    });
  } catch (error) {
    console.error('加载本地数据失败:', error);
    availableFields.value = [];
    totalFeatures.value = 0;
    allTableData.value = [];
    tableData.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadFeatures() {
  // 检查是否是绘制要素（以draw_开头的layerId）或有本地数据
  if (props.layerId.startsWith('draw_') || props.localData) {
    loadFromLocal();
  } else {
    await loadFromServer();
  }
}

function refreshData() {
  loadFeatures();
}
function handleSearch() {
  currentPage.value = 1;
  // 搜索是通过 computed 属性 filteredData 自动响应的
  // 如果有搜索条件但没有全部数据，则加载全部数据
  if (searchField.value && searchValue.value && allTableData.value.length === 0 && totalFeatures.value <= 1000) {
    loadAllDataForSearch();
  }
}

async function loadAllDataForSearch() {
  if (!props.layerId || !availableFields.value.length) return;
  
  // 本地数据已经在allTableData中，不需要重新加载
  if (props.layerId.startsWith('draw_') || props.localData) {
    console.log('使用本地数据进行搜索');
    return;
  }
  
  try {
    console.log('为搜索加载全部数据...');
    const allRowsResponse = (await fetchVectorAttributes(props.layerId, {
      columns: availableFields.value,
      page: 1,
      size: totalFeatures.value
    })) as any;
    const allRows = allRowsResponse.data || allRowsResponse;
    allTableData.value = allRows || [];
    console.log('搜索数据加载完成:', allTableData.value.length, '行');
  } catch (error) {
    console.warn('加载搜索数据失败:', error);
    allTableData.value = tableData.value;
  }
}
function handlePageChange(page: number) {
  currentPage.value = page;
  // 如果有搜索条件，不需要重新加载数据，只需要更新页码
  if (!searchField.value || !searchValue.value) {
    // 本地数据的分页处理
    if (props.layerId.startsWith('draw_') || props.localData) {
      const start = (page - 1) * pageSize.value;
      const end = start + pageSize.value;
      tableData.value = allTableData.value.slice(start, end);
    } else {
      loadFeatures();
    }
  }
}
function handlePageSizeChange(_page: number, sizeVal: number) {
  pageSize.value = sizeVal;
  currentPage.value = 1;
  
  // 本地数据的分页处理
  if (props.layerId.startsWith('draw_') || props.localData) {
    const start = 0;
    const end = sizeVal;
    tableData.value = allTableData.value.slice(start, end);
  } else {
    loadFeatures();
  }
}

function exportData() {
  if (!filteredData.value.length) {
    window.$message?.warning('没有数据可导出');
    return;
  }
  const headers = availableFields.value.join(',');
  const rows = filteredData.value.map(row =>
    availableFields.value
      .map(f => {
        const v = row[f];
        return typeof v === 'string' && v.includes(',') ? `"${v.replace(/"/g, '""')}"` : (v ?? '');
      })
      .join(',')
  );
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${props.layerName}_属性表.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  window.$message?.success('导出成功');
}

function formatCellValue(value: any): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

function onRowClick(_record: any) {
  /* 预留：选中定位 */
}

watch(
  () => props.visible,
  v => {
    if (v) {
      loadState();
      currentPage.value = 1;
      pageSize.value = 50;
      loadFeatures();
    }
  }
);

// 当本地数据（含“绘制要素”总节点聚合数据）变化时，刷新列与数据，保证新加入的字段（如面积）可见
watch(
  () => props.localData,
  () => {
    if (!props.visible) return;
    currentPage.value = 1;
    loadFromLocal();
  }
);
</script>

<template>
  <div
    v-if="visible"
    class="attr-win"
    :style="{
      left: position.x + 'px',
      top: position.y + 'px',
      width: size.width + 'px',
      height: (isMinimized ? headerHeight : size.height) + 'px',
      zIndex: String(zIndex)
    }"
    @mousedown="emitFocus"
  >
    <!-- 标题栏：双击最小化/还原 -->
    <div class="attr-win__header" @dblclick="toggleMinimize" @mousedown="startDrag">
      <div class="title">{{ layerName }} - 属性表</div>
      <div class="actions">
        <AButton type="text" size="small" @click.stop="toggleMinimize">{{ isMinimized ? '□' : '—' }}</AButton>
        <AButton
          type="text"
          size="small"
          @click.stop="
            emit('update:visible', false);
            emit('closed');
          "
        >
          ✕
        </AButton>
      </div>
    </div>

    <div v-show="!isMinimized">
      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="left">
          <AButton type="primary" size="small" @click="refreshData">刷新</AButton>
          <AButton size="small" @click="exportData">导出</AButton>
          <div class="count">共 {{ totalFeatures }} 个要素</div>
        </div>
        <div class="right">
          <select v-model="searchField" class="search-select">
            <option value="">选择字段</option>
            <option v-for="field in availableFields" :key="field" :value="field">{{ field }}</option>
          </select>
          <AInput
            v-model:value="searchValue"
            placeholder="搜索值"
            size="small"
            style="width: 220px"
            allow-clear
            @input="handleSearch"
          />
        </div>
      </div>

      <!-- 表格 -->
      <div class="table-wrap">
        <ATable
          :columns="columns"
          :data-source="pagedData"
          :loading="loading"
          row-key="__feature_id__"
          size="small"
          :scroll="{ y: Math.max(100, size.height - 180) + 'px', x: 'max-content' }"
          :pagination="{
            total: searchField && searchValue ? filteredData.length : totalFeatures,
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

      <!-- 调整大小手柄 -->
      <div class="resizer resizer--right" @mousedown.stop="startResize('right', $event)" />
      <div class="resizer resizer--bottom" @mousedown.stop="startResize('bottom', $event)" />
      <div class="resizer resizer--corner" @mousedown.stop="startResize('corner', $event)" />
    </div>
  </div>
</template>

<style scoped>
.attr-win {
  position: fixed;
  background: #151515;
  border: 1px solid #070707;
  border-radius: 8px;
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.08),
    0 3px 6px -4px rgba(0, 0, 0, 0.12),
    0 9px 28px 8px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
.attr-win__header {
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #0f0f0f;
  border-bottom: 1px solid #101010;
  padding: 0 12px 0 14px;
  cursor: move;
  user-select: none;
}
.attr-win__header .title {
  font-weight: 600;
  color: #eceaea;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  position: relative;
  overflow: visible;
  z-index: 10;
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
.table-wrap {
  padding: 0 12px 12px 12px;
}

.resizer {
  position: absolute;
  background: transparent;
}
.resizer--right {
  right: 0;
  top: 0;
  width: 8px;
  height: 100%;
  cursor: ew-resize;
}
.resizer--bottom {
  left: 0;
  bottom: 0;
  width: 100%;
  height: 8px;
  cursor: ns-resize;
}
.resizer--corner {
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: se-resize;
  background: linear-gradient(-45deg, transparent 6px, #d9d9d9 6px, #d9d9d9 8px, transparent 8px),
    linear-gradient(-45deg, transparent 10px, #d9d9d9 10px, #d9d9d9 12px, transparent 12px);
}

.search-select {
  width: 140px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid #303030;
  border-radius: 4px;
  background: #1f1f1f;
  color: #eceaea;
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

.search-select:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

.search-select option {
  background: #1f1f1f;
  color: #eceaea;
  padding: 4px 8px;
  border-color: #303030;
}

.search-select option:hover {
  background: #2a2a2a;
}

.search-select option:checked {
  background: #1890ff;
  color: #fff;
}
</style>
