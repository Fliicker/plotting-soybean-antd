<script setup lang="ts">
import { h } from 'vue';
import type { CSSProperties } from 'vue';
import { Bubble, Sender } from 'ant-design-x-vue';
import { UserOutlined } from '@ant-design/icons-vue';
import { Flex } from 'ant-design-vue';
import { SimpleScrollbar } from '@sa/materials';

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
    <div class="h-[calc(100%-100px)] w-full p-3">
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
    <div class="bottom-0 h-100px w-full p-3">
      <Sender />
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
