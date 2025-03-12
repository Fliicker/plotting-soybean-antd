/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import MapLayer, { LayerType } from '../MapLayer';

export default class CustomLayer extends MapLayer {
  type: number = LayerType.CUSTOM;
  eventHandlers: Record<string, Function[]> = {}; // 用于存储事件及其处理函数

  // 注册事件
  on(eventName: string, handler: Function) {
    if (!this.eventHandlers[eventName]) {
      this.eventHandlers[eventName] = [];
    }
    this.eventHandlers[eventName].push(handler);
  }

  // 触发事件
  emit(eventName: string, ...args: any[]) {
    const handlers = this.eventHandlers[eventName];
    if (handlers) {
      handlers.forEach(handler => {
        handler(...args);
      });
    }
  }

  load() {
    this.emit('load');
  }

  remove() {
    this.emit('remove');
  }

  open() {
    this.emit('open');
  }

  close() {
    this.emit('close');
  }
}
