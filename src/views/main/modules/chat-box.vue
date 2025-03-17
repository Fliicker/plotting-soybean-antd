<script setup lang="ts">
import { h, nextTick, ref } from 'vue';
import type { Feature, Geometry } from 'geojson';
import { Bubble, Sender } from 'ant-design-x-vue';
import { SimpleScrollbar } from '@sa/materials';
import MindElixir from 'mind-elixir';
import { fetchDifyResponse, fetchGetWorkflowResult } from '@/service/api';

const emit = defineEmits<{
  onLoadNodesByName: [{ id: string; name: string }[]];
  startDraw: [];
  finishDraw: [];
  addAnalysisResults: [
    {
      id: string;
      name: string;
      name_cn: string;
      feature: Feature;
    }[]
  ];
}>();

const botIcon = h('div', {
  style: {
    width: '100%',
    height: '100%',
    backgroundImage: "url('/logo.png')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    borderRadius: '50%'
  }
});
const userIcon = h('div', {
  style: {
    width: '100%',
    height: '100%',
    backgroundImage: "url('/src/assets/svg-icon/avatar.svg')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    borderRadius: '50%'
  }
});

const userInput = ref<string>('');
const inputDisabled = ref<boolean>(false);

const mindMapModalVisible = ref<boolean>(false);
const modalContainerRef = ref<HTMLElement | null>(null);
let mindMapModalInstance: any = null;

const isDrawing = ref<boolean>(false);
const currentWorkflow = ref(null);

// 消息接口
interface Message {
  id: number;
  sender: 'user' | 'bot';
  content: string;
  loading?: boolean;
  branch?: number; // 分支号，2 表示思维导图类型，3 表示绘制任务
  mindMapData?: any; // 格式化后的思维导图数据（MindElixir 格式）
}

// 思维导图结点
interface MindNode {
  topic: string;
  id: string;
  children: MindNode[];
}

// 消息列表
const messages = ref<Message[]>([
  {
    id: Date.now(),
    sender: 'bot',
    content:
      '您好，我是智能问答助手，专注于整合台湾岛最新地理数据、情报分析和战略决策支持，请问有什么可以帮您解答的吗？'
  }
]);

const convertToMindElixirFormat = (data: any): MindNode => {
  const root: MindNode = {
    topic: '决策分析',
    id: 'root',
    children: []
  };

  let nodeId = 1;
  for (const category in data) {
    if (Object.hasOwn(data, category)) {
      const categoryNode: MindNode = {
        topic: category,
        id: `node-${nodeId}`,
        children: []
      };
      nodeId += 1;
      const subCategories = data[category];
      for (const subCategory in subCategories) {
        if (Object.hasOwn(subCategories, subCategory)) {
          const subNode: MindNode = {
            topic: subCategory,
            id: `node-${nodeId}`,
            children: []
          };
          nodeId += 1;

          const factors: string[] = subCategories[subCategory];
          console.log(factors);
          // eslint-disable-next-line max-depth
          for (const factor of factors) {
            subNode.children.push({
              topic: factor,
              id: `node-${nodeId}`,
              children: []
            });
            nodeId += 1;
          }
          categoryNode.children.push(subNode);
        }
      }
      root.children.push(categoryNode);
    }
  }
  return root;
};

const convertThemeDataToText = (data: Record<string, any[]>): string => {
  return Object.entries(data)
    .map(([key, items]) => {
      // 如果 items 是数组且有内容，则抽取 name 字段
      if (Array.isArray(items) && items.length > 0) {
        const names = items.map(item => item.name).join('、');
        return `${key}：${names}`;
      }
      return `${key}：`;
    })
    .join('；\n');
};

// 根据分支号调度不同任务
const executeTask = (branch: number, input: any, botMsg: Message) => {
  switch (branch) {
    case 1: {
      if (input.length === 0) {
        botMsg.content = `未检索到相关数据`;
      } else {
        emit('onLoadNodesByName', input);
        const names = input.map((item: any) => item.name);
        botMsg.content = `已检索到${names.length}条相关数据: ${names.join(
          '、'
        )}。\n相关数据已添加到图层，请查看地图了解详细信息`;
      }
      break;
    }
    case 2: {
      try {
        const mindMapData = convertToMindElixirFormat(input.knowledge);
        botMsg.mindMapData = mindMapData;
        const themeData = input.themeData as Record<string, { id: string; name: string }[]>;
        const themeDataText = convertThemeDataToText(themeData);
        console.log(themeDataText);
        botMsg.content = `针对这一地理场景，我已生成一份决策思维导图，请点击下方“查看导图”按钮进行查看。\n\n同时检索到与该场景相关的主题数据，内容包括：\n${themeDataText}。\n\n主题数据已添加到图层，请查看地图了解详细信息。`;
        const displayData = Object.values(themeData).flatMap(items => items.map(({ id, name }) => ({ id, name })));
        emit('onLoadNodesByName', displayData);
      } catch (err) {
        console.error(err);
        botMsg.content = '服务器繁忙，请稍后再试';
      }
      break;
    }
    case 3: {
      botMsg.branch = 3;
      botMsg.content = '请点击“开始绘制”按钮进入绘制模式，完成绘制后请点击“完成绘制”提交结果。';
      currentWorkflow.value = input;
      break;
    }
    default: {
      botMsg.content = '服务器繁忙，请稍后再试';
      break;
    }
  }
};

// 提取标签内容（返回数组）
const extractTagContent = (tag: string, text: string): string[] => {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
  let match;
  const results: string[] = [];
  while ((match = regex.exec(text)) !== null) {
    results.push(match[1].trim());
  }
  return results;
};

const processResponse = (answer: string, botMsg: Message) => {
  try {
    console.log(answer);
    const categoryMatch = extractTagContent('category', answer);
    const category = categoryMatch && categoryMatch.length ? Number.parseInt(categoryMatch[0], 10) : null;
    let content: any;
    switch (category) {
      case 1: {
        botMsg.branch = 1;
        const jsonContent = extractTagContent('json', answer)[0];
        content = JSON.parse(jsonContent);
        executeTask(1, content, botMsg);
        break;
      }
      case 2: {
        botMsg.branch = 2;
        const think = extractTagContent('think', answer)[0];
        const jsonContents = extractTagContent('json', answer);
        const [knowledge, themeData] = jsonContents;
        content = {
          think,
          knowledge: JSON.parse(knowledge),
          themeData: JSON.parse(themeData)
        };
        executeTask(2, content, botMsg);
        break;
      }
      case 3: {
        const jsonContent = extractTagContent('json', answer)[0];
        content = JSON.parse(jsonContent);
        executeTask(3, content, botMsg);
        break;
      }
      default: {
        botMsg.content = '服务器繁忙，请稍后再试';
        break;
      }
    }
  } catch (err) {
    console.error(err);
    botMsg.content = '服务器繁忙，请稍后再试';
  }
};

const sendMessage = async () => {
  if (!userInput.value.trim()) return;
  isDrawing.value = false;
  messages.value.forEach(message => {
    if (message.branch === 3) delete message.branch;
  });
  const tempInput = userInput.value;
  userInput.value = '';
  nextTick(async () => {
    inputDisabled.value = true;
    const userMsg: Message = {
      id: Date.now(),
      sender: 'user',
      content: tempInput
    };
    messages.value.push(userMsg);
    const botMsg: Message = {
      id: Date.now() + 1,
      sender: 'bot',
      content: '',
      loading: true
    };
    messages.value.push(botMsg);
    userInput.value = '';
    const { error, data } = await fetchDifyResponse(tempInput);
    if (data) {
      processResponse(data.answer, botMsg);
    } else {
      console.log(error);
      botMsg.content = '服务器繁忙，请稍后再试';
    }
    messages.value = [...messages.value];
    botMsg.loading = false;
  });
};

// 打开思维导图弹窗
const openMindMap = (mindData: any) => {
  mindMapModalVisible.value = true;
  nextTick(() => {
    if (modalContainerRef.value && mindData) {
      if (mindMapModalInstance) {
        mindMapModalInstance.destroy();
      }
      mindMapModalInstance = new MindElixir({
        el: modalContainerRef.value,
        direction: MindElixir.SIDE,
        draggable: true,
        contextMenu: true,
        toolBar: true,
        nodeMenu: true,
        keypress: true
      });
      const modalMindData = {
        nodeData: mindData,
        linkData: {}
      };
      mindMapModalInstance.init(modalMindData);
    }
  });
};

const onMindMapModalCancel = () => {
  mindMapModalVisible.value = false;
};

const onTypingComplete = () => {
  inputDisabled.value = false;
};

const startDraw = () => {
  isDrawing.value = true;
  emit('startDraw');
};

const finishDraw = () => {
  isDrawing.value = false;
  emit('finishDraw');
};

const processDraw = async (data: Geometry) => {
  function replaceDataNeeded(obj: any, newValue: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => replaceDataNeeded(item, newValue));
    } else if (obj !== null && typeof obj === 'object') {
      if ('data_needed' in obj) {
        return newValue;
      }
      const newObj: any = {};
      for (const key in obj) {
        if (Object.hasOwn(obj, key)) {
          newObj[key] = replaceDataNeeded(obj[key], newValue);
        }
      }
      return newObj;
    }
    return obj;
  }
  inputDisabled.value = true;
  const botMsg: Message = {
    id: Date.now() + 1,
    sender: 'bot',
    content: '',
    loading: true
  };
  messages.value.push(botMsg);

  const workflow = replaceDataNeeded(currentWorkflow.value, data);
  const { error, data: result } = await fetchGetWorkflowResult(workflow);
  if (result) {
    const analysisResults: {
      id: string;
      name: string;
      name_cn: string;
      feature: Feature;
    }[] = [];
    if (result.buffer_result) {
      const bufferResult = result.buffer_result;
      if (bufferResult.features && bufferResult.features.length !== 0) {
        analysisResults.push({
          id: `buffer-${Math.random().toString(36).substring(7)}`,
          name: 'buffer_result',
          name_cn: '缓冲区分析结果',
          feature: bufferResult.features[0]
        });
      }
    }
    if (result.intersection_result) {
      const intersectionResult = result.intersection_result;
      if (intersectionResult.features && intersectionResult.features?.length !== 0) {
        analysisResults.push({
          id: `intersection-${Math.random().toString(36).substring(7)}`,
          name: 'intersection_result',
          name_cn: '相交分析结果',
          feature: intersectionResult.features[0]
        });
      }
    }

    emit('addAnalysisResults', analysisResults);
    botMsg.content = '已生成分析结果，请查看地图了解详细信息';
  } else {
    console.log(error);
    botMsg.content = '服务器繁忙，请稍后再试';
  }
  messages.value = [...messages.value];
  botMsg.loading = false;
  inputDisabled.value = false;
};

export interface ChatBoxExpose {
  processDraw: (data: Geometry) => void;
}

defineExpose({ processDraw });
</script>

<template>
  <ACard
    title="智能问答"
    :head-style="{
      height: '10%',
      'font-size': '16px',
      border: 'none'
    }"
    :body-style="{
      height: '90%',
      'box-sizing': 'border-box',
      padding: '0 15px 15px 15px'
    }"
    size="small"
    class="h-full w-full border-0 rounded-md bg-tech-5"
  >
    <div class="h-full w-full rounded-md bg-[#223956]">
      <div class="h-[calc(100%-100px)] w-full p-3">
        <SimpleScrollbar>
          <Flex gap="middle" vertical class="pt-2">
            <template v-for="msg in messages" :key="msg.id">
              <Bubble
                :placement="msg.sender === 'bot' ? 'start' : 'end'"
                :content="msg.content"
                :loading="msg.loading"
                :avatar="msg.sender === 'bot' ? { icon: botIcon } : { icon: userIcon }"
                :typing="msg.sender === 'bot' ? { interval: 10 } : false"
                @typing-complete="msg.sender === 'bot' && onTypingComplete()"
              >
                <template #footer>
                  <template v-if="msg.branch === 2">
                    <AButton type="default" size="small" @click="openMindMap(msg.mindMapData)">查看导图</AButton>
                  </template>
                  <template v-if="msg.branch === 3">
                    <template v-if="!isDrawing">
                      <AButton type="default" size="small" @click="startDraw">开始绘制</AButton>
                    </template>
                    <template v-else>
                      <AButton type="default" size="small" @click="finishDraw">完成绘制</AButton>
                    </template>
                  </template>
                </template>
              </Bubble>
            </template>
          </Flex>
        </SimpleScrollbar>
      </div>
      <div class="bottom-0 h-100px w-full p-3">
        <Sender v-model:value="userInput" :disabled="inputDisabled" @submit="sendMessage" />
      </div>
    </div>
  </ACard>
  <AModal v-model:open="mindMapModalVisible" title="思维导图" width="80%" :footer="null" @cancel="onMindMapModalCancel">
    <div ref="modalContainerRef" class="h-[600px] w-full"></div>
  </AModal>
</template>

<style lang="scss">
.ant-bubble-content-filled {
  background-image: linear-gradient(to bottom, #30b4ee, #29a3e7) !important;
  white-space: pre-wrap;
}

.ant-sender-content {
  height: 80px !important;
  background-color: rgb(208, 228, 247) !important;
  border-radius: 13px !important;
  overflow: auto;
}

.anticon-user {
  height: 100%;
  width: 100%;
}
</style>
