<script setup lang="ts">
import { h, ref } from 'vue';
import type { CSSProperties } from 'vue';
import { Bubble } from 'ant-design-x-vue';
import { UserOutlined } from '@ant-design/icons-vue';
import { Flex } from 'ant-design-vue';
import { SimpleScrollbar } from '@sa/materials';

const userText = ref('');
const fooAvatar: CSSProperties = {
  color: '#f56a00',
  backgroundColor: '#fde3cf'
};

const barAvatar: CSSProperties = {
  color: '#fff',
  backgroundColor: '#87d068'
};

const hideAvatar: CSSProperties = {
  visibility: 'hidden'
};
// import { onMounted, ref } from "vue";

// onMounted(() => {});
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
    <!--不用small会导致body部分溢出？？？-->
    <div class="h-3/4 w-full p-3">
      <SimpleScrollbar>
        <Flex gap="middle" vertical>
          <Bubble
            variant="filled"
            placement="start"
            content="Good morning, how are you?"
            :avatar="{ icon: h(UserOutlined), style: fooAvatar }"
          />
          <Bubble placement="start" content="What a beautiful day!" :styles="{ avatar: hideAvatar }" :avatar="{}" />
          <Bubble
            placement="end"
            content="Hi, good morning, I'm fine!"
            :avatar="{ icon: h(UserOutlined), style: barAvatar }"
          />
          <Bubble
            placement="start"
            content="Thank you!"
            :avatar="{ icon: h(UserOutlined), style: fooAvatar }"
            :loading="true"
          />
        </Flex>
      </SimpleScrollbar>
    </div>
    <div class="h-1/4 w-full p-3">
      <ATextarea v-model:value="userText" placeholder="Autosize height based on content lines" />
    </div>
  </ACard>
</template>

<style lang="scss">
.ant-bubble-content-filled {
  background-color: rgb(110, 150, 183) !important;
}
</style>
