<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { h } from 'vue';
import { Bubble } from 'ant-design-x-vue';
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
      padding: '15px'
    }"
    class="h-full w-full rounded-md bg-tech-5"
  >
    <div class="h-3/4 w-full">
      <SimpleScrollbar>
        <Flex gap="middle" vertical>
          <!--
 <Welcome
          icon="https://mdn.alipayobjects.com/huamei_iwk9zp/afts/img/A*s5sNRo5LjfQAAAAAAAAAAAAADgCCAQ/fmt.webp"
          title="Hello, I'm Ant Design X"
          description="Base on Ant Design, AGI product interface solution, create a better intelligent vision~"
        /> 
-->
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
    <div class="h-1/4 w-full bg-tech-3"></div>
  </ACard>
</template>

<style lang="scss">
.ant-bubble-content-filled {
  background-color: rgb(110, 150, 183) !important;
}
</style>
