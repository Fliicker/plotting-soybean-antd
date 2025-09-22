<template>
  <div class="layout-view h-full w-full bg-gray-900 relative overflow-hidden">
    <!-- 布局视图工具栏 -->
    <div class="layout-toolbar bg-gray-900 border-b border-gray-800 h-12 flex items-center px-4 gap-4 shadow-sm text-gray-100">
      <!-- 页面设置 -->
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-200">页面设置:</span>
        <ASelect v-model:value="pageSettings.size" class="w-32" size="small">
          <ASelectOption value="A4">A4</ASelectOption>
          <ASelectOption value="A3">A3</ASelectOption>
          <ASelectOption value="A2">A2</ASelectOption>
          <ASelectOption value="Letter">Letter</ASelectOption>
          <ASelectOption value="custom">自定义</ASelectOption>
        </ASelect>
        
        <ASelect v-model:value="pageSettings.orientation" class="w-24" size="small">
          <ASelectOption value="portrait">竖向</ASelectOption>
          <ASelectOption value="landscape">横向</ASelectOption>
        </ASelect>
      </div>

      <ADivider type="vertical" />

      <!-- 布局元素工具 -->
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-200">插入:</span>
        <ATooltip title="添加地图框">
          <AButton size="small" @click="addMapFrame">
            <template #icon>
              <Icon icon="material-symbols:map-outline" />
            </template>
          </AButton>
        </ATooltip>
        
        <ATooltip title="添加图例">
          <AButton size="small" @click="addLegend">
            <template #icon>
              <Icon icon="material-symbols:format-list-bulleted" />
            </template>
          </AButton>
        </ATooltip>
        
        <ATooltip title="添加比例尺">
          <AButton size="small" @click="addScaleBar">
            <template #icon>
              <Icon icon="material-symbols:straighten" />
            </template>
          </AButton>
        </ATooltip>
        
        <ATooltip title="添加指北针">
          <AButton size="small" @click="addNorthArrow">
            <template #icon>
              <Icon icon="material-symbols:navigation-outline" />
            </template>
          </AButton>
        </ATooltip>
        
        <ATooltip title="添加文本">
          <AButton size="small" @click="addTextBox">
            <template #icon>
              <Icon icon="material-symbols:text-fields" />
            </template>
          </AButton>
        </ATooltip>
      </div>

      <ADivider type="vertical" />

      <!-- 模板功能 -->
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-200">模板:</span>
        <ASelect v-model:value="selectedTemplate" class="w-32" size="small" @change="(value) => applyTemplate(value as string)">
          <ASelectOption value="">自定义</ASelectOption>
          <ASelectOption value="standard">标准地图</ASelectOption>
          <ASelectOption value="detailed">详细地图</ASelectOption>
          <ASelectOption value="simple">简洁地图</ASelectOption>
        </ASelect>
        
        <ATooltip title="保存当前布局为模板">
          <AButton size="small" @click="saveAsTemplate">
            <template #icon>
              <Icon icon="material-symbols:save-outline" />
            </template>
          </AButton>
        </ATooltip>
      </div>

      <ADivider type="vertical" />

      <!-- 导出功能 -->
      <div class="flex items-center gap-2">
        <ATooltip title="导出为PNG">
          <AButton type="primary" size="small" class="export-btn" @click="exportAsPNG">
            <template #icon>
              <Icon icon="material-symbols:download" />
            </template>
            PNG
          </AButton>
        </ATooltip>
        
        <ATooltip title="导出为PDF">
          <AButton type="primary" size="small" class="export-btn" @click="exportAsPDF">
            <template #icon>
              <Icon icon="material-symbols:picture-as-pdf" />
            </template>
            PDF
          </AButton>
        </ATooltip>
      </div>

      <div class="flex-1"></div>

      <!-- 关闭按钮 -->
      <AButton class="close-btn" @click="goBack">
        <template #icon>
          <Icon icon="material-symbols:close" />
        </template>
        关闭布局视图
      </AButton>
    </div>

    <!-- 主要布局区域 -->
    <div class="layout-main flex h-[calc(100%-3rem)]">
      <!-- 左侧属性面板 -->
      <div class="layout-properties bg-gray-900 border-r border-gray-800 w-80 overflow-y-auto text-gray-100">
        <div class="p-4">
          <h3 class="text-lg font-medium mb-4 text-gray-200">布局元素</h3>
          
          <!-- 布局元素列表 -->
          <div class="space-y-2">
            <div
              v-for="element in layoutElements"
              :key="element.id"
              :class="[
                'p-3 border rounded cursor-pointer transition-colors',
                selectedElement?.id === element.id 
                  ? 'border-blue-400 bg-blue-900/30' 
                  : 'border-gray-700 hover:border-gray-600'
              ]"
              @click="selectElement(element)"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Icon :icon="getElementIcon(element.type)" class="text-gray-300" />
                  <span class="text-sm font-medium text-gray-200">{{ element.name }}</span>
                </div>
                <AButton size="small" danger @click.stop="removeElement(element.id)">
                  <Icon icon="material-symbols:delete-outline" />
                </AButton>
              </div>
            </div>
          </div>

          <!-- 选中元素的属性编辑 -->
          <div v-if="selectedElement" class="mt-6">
            <h4 class="text-md font-medium mb-3 text-gray-200">属性设置</h4>
            
            <!-- 位置和大小 -->
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="text-xs text-gray-400">X坐标</label>
                  <AInputNumber 
                    v-model:value="selectedElement.x" 
                    size="small" 
                    class="w-full"
                    @change="updateElementPosition"
                  />
                </div>
                <div>
                  <label class="text-xs text-gray-400">Y坐标</label>
                  <AInputNumber 
                    v-model:value="selectedElement.y" 
                    size="small" 
                    class="w-full"
                    @change="updateElementPosition"
                  />
                </div>
              </div>
              
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="text-xs text-gray-400">宽度</label>
                  <AInputNumber 
                    v-model:value="selectedElement.width" 
                    size="small" 
                    class="w-full"
                    @change="updateElementSize"
                  />
                </div>
                <div>
                  <label class="text-xs text-gray-400">高度</label>
                  <AInputNumber 
                    v-model:value="selectedElement.height" 
                    size="small" 
                    class="w-full"
                    @change="updateElementSize"
                  />
                </div>
              </div>

              <!-- 文本元素特殊属性 -->
              <div v-if="selectedElement.type === 'text'">
                <label class="text-xs text-gray-400">文本内容</label>
                <ATextarea 
                  v-model:value="selectedElement.content" 
                  size="small" 
                  :rows="3"
                  @change="updateElementContent"
                />
                
                <div class="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label class="text-xs text-gray-400">字体大小</label>
                    <AInputNumber 
                      v-model:value="selectedElement.fontSize" 
                      size="small" 
                      class="w-full"
                      :min="8"
                      :max="72"
                      @change="updateElementStyle"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-gray-400">字体颜色</label>
                    <input 
                      v-model="selectedElement.color" 
                      type="color" 
                      class="w-full h-8 border rounded"
                      @change="updateElementStyle"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 中间画布区域 -->
      <div class="layout-canvas flex-1 p-8 overflow-auto">
        <div class="flex justify-center">
          <!-- 页面画布 -->
          <div
            ref="canvasRef"
            :class="[
              'page-canvas bg-white shadow-lg relative',
              pageSettings.orientation === 'portrait' ? 'canvas-portrait' : 'canvas-landscape'
            ]"
            :style="canvasStyle"
            @click="deselectElement"
          >
            <!-- 布局元素渲染 -->
            <div
              v-for="element in layoutElements"
              :key="element.id"
              :class="[
                'layout-element absolute cursor-move select-none',
                selectedElement?.id === element.id ? 'selected' : ''
              ]"
              :style="getElementStyle(element)"
              @click.stop="selectElement(element)"
              @mousedown="startDrag($event, element)"
            >
              <!-- 地图框 -->
              <div v-if="element.type === 'map'" class="map-frame border-2 border-dashed border-gray-400 h-full flex items-center justify-center bg-gray-50">
                <div class="text-center text-gray-600">
                  <Icon icon="material-symbols:map-outline" class="text-4xl mb-2" />
                  <div class="text-sm">地图视图</div>
                  <div class="text-xs text-gray-500">{{ element.width }} × {{ element.height }}</div>
                </div>
              </div>

              <!-- 图例 -->
              <div v-else-if="element.type === 'legend'" class="legend-frame border border-gray-300 h-full p-2 bg-white">
                <div class="text-sm font-bold mb-2">图例</div>
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <div class="w-4 h-3 bg-blue-500"></div>
                    <span class="text-xs">示例图层1</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="w-4 h-3 bg-green-500"></div>
                    <span class="text-xs">示例图层2</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="w-4 h-3 bg-red-500"></div>
                    <span class="text-xs">示例图层3</span>
                  </div>
                </div>
              </div>

              <!-- 比例尺 -->
              <div v-else-if="element.type === 'scalebar'" class="scalebar-frame h-full flex items-center">
                <div class="scale-bar">
                  <div class="flex">
                    <div class="w-12 h-4 border-l border-b border-t border-black bg-white"></div>
                    <div class="w-12 h-4 border-r border-b border-t border-black bg-black"></div>
                    <div class="w-12 h-4 border-r border-b border-t border-black bg-white"></div>
                  </div>
                  <div class="flex text-xs justify-between mt-1">
                    <span>0</span>
                    <span>50</span>
                    <span>100 km</span>
                  </div>
                </div>
              </div>

              <!-- 指北针 -->
              <div v-else-if="element.type === 'north'" class="north-arrow h-full flex items-center justify-center">
                <div class="text-center">
                  <Icon icon="material-symbols:navigation-outline" class="text-3xl transform rotate-0" />
                  <div class="text-xs mt-1">N</div>
                </div>
              </div>

              <!-- 文本框 -->
              <div v-else-if="element.type === 'text'" class="text-element h-full overflow-hidden">
                <div 
                  :style="{ 
                    fontSize: element.fontSize + 'px',
                    color: element.color,
                    lineHeight: '1.2'
                  }"
                >
                  {{ element.content }}
                </div>
              </div>

              <!-- 选中状态的调整句柄 -->
              <div v-if="selectedElement?.id === element.id" class="resize-handles">
                <div class="handle handle-nw" @mousedown.stop="startResize($event, element, 'nw')"></div>
                <div class="handle handle-ne" @mousedown.stop="startResize($event, element, 'ne')"></div>
                <div class="handle handle-sw" @mousedown.stop="startResize($event, element, 'sw')"></div>
                <div class="handle handle-se" @mousedown.stop="startResize($event, element, 'se')"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { Icon } from '@iconify/vue';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// 路由
const router = useRouter();

// 页面设置
const pageSettings = reactive({
  size: 'A4',
  orientation: 'portrait' as 'portrait' | 'landscape',
  width: 794, // A4宽度(像素)
  height: 1123 // A4高度(像素)
});

// 布局元素接口
interface LayoutElement {
  id: string;
  type: 'map' | 'legend' | 'scalebar' | 'north' | 'text';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  fontSize?: number;
  color?: string;
}

// 布局元素数组
const layoutElements = ref<LayoutElement[]>([]);
const selectedElement = ref<LayoutElement | null>(null);
const canvasRef = ref<HTMLElement>();

// 模板相关
const selectedTemplate = ref('');

// 拖拽相关
const isDragging = ref(false);
const isResizing = ref(false);
const dragStartPos = ref({ x: 0, y: 0, elementX: 0, elementY: 0 });
const resizeDirection = ref('');

// 画布样式
const canvasStyle = computed(() => {
  const width = pageSettings.orientation === 'portrait' ? pageSettings.width : pageSettings.height;
  const height = pageSettings.orientation === 'portrait' ? pageSettings.height : pageSettings.width;
  
  return {
    width: `${width}px`,
    height: `${height}px`,
    minHeight: `${height}px`
  };
});

// 获取元素图标
const getElementIcon = (type: string) => {
  const icons = {
    map: 'material-symbols:map-outline',
    legend: 'material-symbols:format-list-bulleted',
    scalebar: 'material-symbols:straighten',
    north: 'material-symbols:navigation-outline',
    text: 'material-symbols:text-fields'
  };
  return icons[type as keyof typeof icons] || 'material-symbols:help-outline';
};

// 获取元素样式
const getElementStyle = (element: LayoutElement) => {
  return {
    left: `${element.x}px`,
    top: `${element.y}px`,
    width: `${element.width}px`,
    height: `${element.height}px`
  };
};

// 生成唯一ID
const generateId = () => {
  return 'element_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// 添加地图框
const addMapFrame = () => {
  const newElement: LayoutElement = {
    id: generateId(),
    type: 'map',
    name: '地图框',
    x: 50,
    y: 50,
    width: 400,
    height: 300
  };
  layoutElements.value.push(newElement);
  selectElement(newElement);
};

// 添加图例
const addLegend = () => {
  const newElement: LayoutElement = {
    id: generateId(),
    type: 'legend',
    name: '图例',
    x: 500,
    y: 50,
    width: 150,
    height: 200
  };
  layoutElements.value.push(newElement);
  selectElement(newElement);
};

// 添加比例尺
const addScaleBar = () => {
  const newElement: LayoutElement = {
    id: generateId(),
    type: 'scalebar',
    name: '比例尺',
    x: 50,
    y: 400,
    width: 120,
    height: 40
  };
  layoutElements.value.push(newElement);
  selectElement(newElement);
};

// 添加指北针
const addNorthArrow = () => {
  const newElement: LayoutElement = {
    id: generateId(),
    type: 'north',
    name: '指北针',
    x: 600,
    y: 300,
    width: 60,
    height: 80
  };
  layoutElements.value.push(newElement);
  selectElement(newElement);
};

// 添加文本框
const addTextBox = () => {
  const newElement: LayoutElement = {
    id: generateId(),
    type: 'text',
    name: '文本框',
    x: 200,
    y: 400,
    width: 200,
    height: 50,
    content: '输入文本内容',
    fontSize: 14,
    color: '#000000'
  };
  layoutElements.value.push(newElement);
  selectElement(newElement);
};

// 选择元素
const selectElement = (element: LayoutElement) => {
  selectedElement.value = element;
};

// 取消选择
const deselectElement = () => {
  selectedElement.value = null;
};

// 移除元素
const removeElement = (elementId: string) => {
  layoutElements.value = layoutElements.value.filter(el => el.id !== elementId);
  if (selectedElement.value?.id === elementId) {
    selectedElement.value = null;
  }
};

// 更新元素位置
const updateElementPosition = () => {
  // 位置已通过v-model自动更新
};

// 更新元素大小
const updateElementSize = () => {
  // 大小已通过v-model自动更新
};

// 更新元素内容
const updateElementContent = () => {
  // 内容已通过v-model自动更新
};

// 更新元素样式
const updateElementStyle = () => {
  // 样式已通过v-model自动更新
};

// 开始拖拽
const startDrag = (event: MouseEvent, element: LayoutElement) => {
  isDragging.value = true;
  dragStartPos.value = {
    x: event.clientX,
    y: event.clientY,
    elementX: element.x,
    elementY: element.y
  };
  selectElement(element);
};

// 开始调整大小
const startResize = (event: MouseEvent, element: LayoutElement, direction: string) => {
  isResizing.value = true;
  resizeDirection.value = direction;
  dragStartPos.value = {
    x: event.clientX,
    y: event.clientY,
    elementX: element.x,
    elementY: element.y
  };
  selectElement(element);
};

// 鼠标移动处理
const handleMouseMove = (event: MouseEvent) => {
  if (!selectedElement.value) return;

  const deltaX = event.clientX - dragStartPos.value.x;
  const deltaY = event.clientY - dragStartPos.value.y;

  if (isDragging.value) {
    selectedElement.value.x = dragStartPos.value.elementX + deltaX;
    selectedElement.value.y = dragStartPos.value.elementY + deltaY;
  } else if (isResizing.value) {
    const direction = resizeDirection.value;
    
    if (direction.includes('e')) {
      selectedElement.value.width = Math.max(20, selectedElement.value.width + deltaX);
    }
    if (direction.includes('w')) {
      const newWidth = Math.max(20, selectedElement.value.width - deltaX);
      selectedElement.value.x = dragStartPos.value.elementX + deltaX;
      selectedElement.value.width = newWidth;
    }
    if (direction.includes('s')) {
      selectedElement.value.height = Math.max(20, selectedElement.value.height + deltaY);
    }
    if (direction.includes('n')) {
      const newHeight = Math.max(20, selectedElement.value.height - deltaY);
      selectedElement.value.y = dragStartPos.value.elementY + deltaY;
      selectedElement.value.height = newHeight;
    }
  }
};

// 鼠标释放处理
const handleMouseUp = () => {
  isDragging.value = false;
  isResizing.value = false;
  resizeDirection.value = '';
};

// 导出为PNG
const exportAsPNG = async () => {
  if (!canvasRef.value) return;
  
  try {
    const canvas = await html2canvas(canvasRef.value, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true
    });
    
    const link = document.createElement('a');
    link.download = `layout_${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
    
    message.success('PNG导出成功！');
  } catch (error) {
    console.error('PNG导出失败:', error);
    message.error('PNG导出失败，请重试');
  }
};

// 导出为PDF
const exportAsPDF = async () => {
  if (!canvasRef.value) return;
  
  try {
    const canvas = await html2canvas(canvasRef.value, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: pageSettings.orientation,
      unit: 'px',
      format: [pageSettings.width, pageSettings.height]
    });
    
    pdf.addImage(imgData, 'PNG', 0, 0, pageSettings.width, pageSettings.height);
    pdf.save(`layout_${Date.now()}.pdf`);
    
    message.success('PDF导出成功！');
  } catch (error) {
    console.error('PDF导出失败:', error);
    message.error('PDF导出失败，请重试');
  }
};

// 预定义模板
const layoutTemplates = {
  standard: [
    {
      id: 'map_1',
      type: 'map' as const,
      name: '地图框',
      x: 50,
      y: 80,
      width: 500,
      height: 400
    },
    {
      id: 'legend_1',
      type: 'legend' as const,
      name: '图例',
      x: 580,
      y: 80,
      width: 150,
      height: 200
    },
    {
      id: 'scalebar_1',
      type: 'scalebar' as const,
      name: '比例尺',
      x: 50,
      y: 500,
      width: 120,
      height: 40
    },
    {
      id: 'north_1',
      type: 'north' as const,
      name: '指北针',
      x: 650,
      y: 300,
      width: 60,
      height: 80
    },
    {
      id: 'title_1',
      type: 'text' as const,
      name: '标题',
      x: 200,
      y: 30,
      width: 300,
      height: 40,
      content: '地图标题',
      fontSize: 24,
      color: '#000000'
    }
  ],
  detailed: [
    {
      id: 'map_1',
      type: 'map' as const,
      name: '主地图',
      x: 50,
      y: 100,
      width: 400,
      height: 350
    },
    {
      id: 'map_2',
      type: 'map' as const,
      name: '概览图',
      x: 480,
      y: 100,
      width: 200,
      height: 150
    },
    {
      id: 'legend_1',
      type: 'legend' as const,
      name: '图例',
      x: 480,
      y: 270,
      width: 200,
      height: 180
    },
    {
      id: 'scalebar_1',
      type: 'scalebar' as const,
      name: '比例尺',
      x: 50,
      y: 470,
      width: 120,
      height: 40
    },
    {
      id: 'north_1',
      type: 'north' as const,
      name: '指北针',
      x: 620,
      y: 470,
      width: 60,
      height: 80
    },
    {
      id: 'title_1',
      type: 'text' as const,
      name: '主标题',
      x: 200,
      y: 30,
      width: 300,
      height: 40,
      content: '详细地图布局',
      fontSize: 24,
      color: '#000000'
    },
    {
      id: 'subtitle_1',
      type: 'text' as const,
      name: '副标题',
      x: 200,
      y: 70,
      width: 300,
      height: 25,
      content: '比例尺 1:10000',
      fontSize: 14,
      color: '#666666'
    }
  ],
  simple: [
    {
      id: 'map_1',
      type: 'map' as const,
      name: '地图框',
      x: 100,
      y: 100,
      width: 600,
      height: 450
    },
    {
      id: 'title_1',
      type: 'text' as const,
      name: '标题',
      x: 250,
      y: 40,
      width: 300,
      height: 40,
      content: '简洁地图',
      fontSize: 28,
      color: '#000000'
    }
  ]
};

// 应用模板
const applyTemplate = (templateName: string) => {
  if (!templateName || !layoutTemplates[templateName as keyof typeof layoutTemplates]) {
    return;
  }
  
  const template = layoutTemplates[templateName as keyof typeof layoutTemplates];
  layoutElements.value = template.map(element => ({
    ...element,
    id: generateId() // 生成新的唯一ID
  }));
  
  selectedElement.value = null;
  message.success(`已应用${templateName === 'standard' ? '标准' : templateName === 'detailed' ? '详细' : '简洁'}模板`);
};

// 保存为模板
const saveAsTemplate = () => {
  if (layoutElements.value.length === 0) {
    message.warning('当前布局为空，无法保存为模板');
    return;
  }
  
  // 这里可以实现保存到本地存储或服务器
  const templateData = JSON.stringify(layoutElements.value, null, 2);
  console.log('保存的模板数据:', templateData);
  
  // 创建下载链接
  const blob = new Blob([templateData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `layout_template_${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  
  message.success('模板已保存并下载');
};

// 返回主界面
const goBack = () => {
  router.push('/main');
};

// 组件挂载
onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});

// 组件卸载
onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
});
</script>

<style scoped>
.export-btn {
  height: 36px;
  padding: 0 14px;
  line-height: 1;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.close-btn {
  height: 36px;
  padding: 0 14px;
  line-height: 1;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.layout-element {
  border: 1px solid transparent;
  transition: border-color 0.2s;
}

.layout-element:hover {
  border-color: #d1d5db;
}

.layout-element.selected {
  border-color: #3b82f6;
  border-width: 2px;
}

.resize-handles {
  position: absolute;
  inset: -4px;
  pointer-events: none;
}

.handle {
  position: absolute;
  width: 8px;
  height: 8px;
  background: #3b82f6;
  border: 1px solid #ffffff;
  border-radius: 50%;
  pointer-events: all;
  cursor: grab;
}

.handle:active {
  cursor: grabbing;
}

.handle-nw {
  top: 0;
  left: 0;
  cursor: nw-resize;
}

.handle-ne {
  top: 0;
  right: 0;
  cursor: ne-resize;
}

.handle-sw {
  bottom: 0;
  left: 0;
  cursor: sw-resize;
}

.handle-se {
  bottom: 0;
  right: 0;
  cursor: se-resize;
}

.canvas-portrait {
  width: 794px;
  min-height: 1123px;
}

.canvas-landscape {
  width: 1123px;
  min-height: 794px;
}

.page-canvas {
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}
</style>
