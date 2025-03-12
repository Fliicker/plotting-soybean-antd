/* eslint-disable no-underscore-dangle */

import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox';
import { reactive } from 'vue';
import MapNode from './MapNode';

export interface ViewState {
  center?: [number, number];
  pitch?: number;
  bearing?: number;
  zoom?: number;
}

export default class MapScene {
  nodes: MapNode[] = [];
  deckOverlay = new DeckOverlay({
    interleaved: true,
    layers: [],
    getCursor: () => 'inherit' // deck鼠标指针继承自mapbox
  });
  viewState: ViewState = {
    center: [118.5, 34.5],
    pitch: 0,
    bearing: 0,
    zoom: 7
  };
  _nodeStatus = reactive<Record<string, boolean>>({});
  nodeStatus: Record<string, boolean> | null = null; // 代理对象，用于监听nodeStatus变化
  map: mapboxgl.Map;

  constructor(_map: mapboxgl.Map) {
    this.map = _map;
    this.map.addControl(this.deckOverlay);
  }

  loadFromData(_dataList: Map.LayerData[]) {
    _dataList.forEach(data => {
      const node = MapNode.createFromData(data, this);
      this._nodeStatus[data.id] = false;
      this.addNode(node);
    });
    // this.nodeStatus = new Proxy(this._nodeStatus, {
    //   set: (target, key, value) => {
    //     const keyStr = key as string;
    //     if (target[keyStr] !== value) {
    //       if (value) {
    //         this._loadNode(keyStr); // 仅在此处控制node加载
    //       } else {
    //         this._removeNode(keyStr);
    //       }
    //     }
    //     target[keyStr] = value;
    //     return true;
    //   }
    // });
  }

  addNode(node: MapNode) {
    this.nodes.push(node);
    return this.nodes.indexOf(node);
  }

  removeAllNodes() {
    this.nodes.forEach(node => {
      node.removeAll();
    });
  }

  setStatus(updateSet: Record<string, boolean>) {
    // eslint-disable-next-line guard-for-in
    for (const id in updateSet) {
      this.nodeStatus![id] = updateSet[id];
    }
  }

  // // 不再暴露接口
  // private _loadNode(id: string) {
  //   const node = this.findNodeById(id);
  //   if (node !== undefined) {
  //     node.loadAll();
  //     if (!this.activeNodes.includes(id)) {
  //       this.activeNodes.push(id);
  //     }
  //     // node.flyToThis();
  //   }
  // }

  loadNode(id: string): boolean {
    const node = this.findNodeById(id);
    if (node !== undefined && !node.active) {
      node.loadAll();
      // node.flyToThis();
      return true;
    }
    return false;
  }

  // private _removeNode(id: string) {
  //   const node = this.findNodeById(id);
  //   if (node !== undefined) {
  //     node.removeAll();
  //   }
  // }

  removeNode(id: string): boolean {
    const node = this.findNodeById(id);
    if (node !== undefined && node.active) {
      node.removeAll();
      return true;
    }
    return false;
  }

  openNode(id: string) {
    const node = this.findNodeById(id);
    if (node !== undefined && node.active) {
      node.openAll();
    }
  }

  closeNode(id: string) {
    const node = this.findNodeById(id);
    if (node !== undefined && node.active) {
      node.closeAll();
    }
  }

  moveNode(id: string, beforeId: string | null) {
    const node = this.findNodeById(id);
    if (node !== undefined && node.active) {
      if (beforeId !== null) {
        const beforeNode = this.findNodeById(beforeId) ?? null;
        node.moveBeforeNode(beforeNode);
      } else {
        node.moveBeforeNode(null);
      }
    }
  }

  findNodeById(id: string): MapNode | undefined {
    return this.nodes.find(node => node.id === id);
  }

  findNodeByName(name: string): MapNode | undefined {
    return this.nodes.find(node => node.name === name);
  }

  flyToThis() {
    this.map.easeTo(this.viewState);
  }

  get terrainId(): string | null {
    const terrain = this.map.getTerrain();
    if (terrain === null || terrain === undefined) return null;
    return terrain.source;
  }

  set terrainId(id: string | null) {
    if (id === null) {
      this.map.setTerrain(null);
    } else {
      if (!this.map.getSource(id)) {
        console.log(`source ${id} not exists`);
        return;
      }
      this.map.setTerrain({ source: id, exaggeration: 1.0 });
    }
  }
}
