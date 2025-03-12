<script setup lang="ts">
import { h, ref } from 'vue';
import type { CSSProperties } from 'vue';
import { Bubble, Sender } from 'ant-design-x-vue';
import { UserOutlined } from '@ant-design/icons-vue';
import { Flex } from 'ant-design-vue';
import { SimpleScrollbar } from '@sa/materials';
import { fetchDifyResponse } from '@/service/api';

const fooAvatar: CSSProperties = {
  color: '#f56a00',
  backgroundColor: '#fde3cf'
};

const barAvatar: CSSProperties = {
  color: '#fff',
  backgroundColor: '#87d068'
};

// const hideAvatar: CSSProperties = {
//   visibility: 'hidden'
// };

// 定义消息接口
interface Message {
  id: number;
  sender: 'user' | 'bot';
  content: string;
  loading?: boolean;
}

// 消息列表、会话 id 以及用户输入
const messages = ref<Message[]>([
  {
    id: Date.now(),
    sender: 'bot',
    content: '你好，我是人机'
  }
]);
const userInput = ref<string>('');

const emit = defineEmits<{
  onLoadNodesByName: [{ id: string; name: string }[]];
}>();

const executeTask = (branch: number, input: { id: string; name: string }[], botMsg: Message) => {
  switch (branch) {
    case 1: {
      if (input.length === 0) {
        botMsg.content = `未检索到相关数据。`;
      } else {
        emit('onLoadNodesByName', input);
        const names = input.map(item => item.name);
        botMsg.content = `已检索到相关数据${names.length}条:${names.join('、')}。`;
      }
      botMsg.loading = false;
      break;
    }
    case 2:
      break;
    case 3:
      break;
    default: {
      botMsg.content = '服务器繁忙，请稍后再试';
      botMsg.loading = false;
      break;
    }
  }
};

const processResponse = (answer: string, botMsg: Message) => {
  console.log(answer);

  const parsedAnswer = JSON.parse(answer);
  const { category, content } = parsedAnswer;

  executeTask(Number.parseInt(category, 10), content, botMsg);
};

const sendMessage = async () => {
  if (!userInput.value.trim()) return;

  const userMsg: Message = {
    id: Date.now(),
    sender: 'user',
    content: userInput.value
  };
  messages.value.push(userMsg);

  const botMsg: Message = {
    id: Date.now() + 1,
    sender: 'bot',
    content: '',
    loading: true
  };
  messages.value.push(botMsg);

  const { error, data } = await fetchDifyResponse(userInput.value);

  if (data) {
    processResponse(data.answer, botMsg);
  } else {
    console.log(error);
    botMsg.content = '服务器繁忙，请稍后再试';
    botMsg.loading = false;
    messages.value = [...messages.value];
  }

  userInput.value = '';
};
</script>

<template>
  <ACard
    title="智能问答"
    :head-style="{ height: '10%' }"
    :body-style="{
      height: '90%',
      'box-sizing': 'border-box',
      padding: '10px'
    }"
    size="small"
    class="h-full w-full rounded-md bg-tech-5"
  >
    <!-- 消息展示区域 -->
    <div class="h-[calc(100%-100px)] w-full p-3">
      <SimpleScrollbar>
        <Flex gap="middle" vertical>
          <!-- 遍历消息列表，渲染每个消息气泡 -->
          <template v-for="msg in messages" :key="msg.id">
            <Bubble
              :placement="msg.sender === 'bot' ? 'start' : 'end'"
              :content="msg.content"
              :loading="msg.loading"
              :avatar="
                msg.sender === 'bot'
                  ? { icon: h(UserOutlined), style: fooAvatar }
                  : { icon: h(UserOutlined), style: barAvatar }
              "
            />
          </template>
        </Flex>
      </SimpleScrollbar>
    </div>
    <!-- 输入框区域 -->
    <div class="bottom-0 h-100px w-full p-3">
      <!-- Sender 组件假设支持 v-model:value 双向绑定以及发送事件 -->
      <Sender v-model:value="userInput" @submit="sendMessage" />
    </div>
  </ACard>
</template>

<style lang="scss">
.ant-bubble-content-filled {
  background-color: rgb(110, 150, 183) !important;
}

.ant-sender-content {
  height: 80px !important;
  background-color: rgb(208, 228, 247) !important;
  border-radius: 13px !important;
  overflow: auto;
}
</style>
