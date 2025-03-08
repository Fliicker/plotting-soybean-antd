import PointLayer from './layerClasses/PointLayer';
import LabelLayer from './layerClasses/LabelLayer';
import LineLayer from './layerClasses/LineLayer';
import PolygonLayer from './layerClasses/PolygonLayer';
import RasterLayer from './layerClasses/RasterLayer';
import CustomLayer from './layerClasses/CustomLayer';

const NodeType = {
  POINT: 0,
  LINE: 1,
  POLYGON: 2,
  RASTER: 3,
  THREED: 4,
  UNDERWATER: 5,
  CUSTOM: 6
};

export default class MapNode {
  scene: any = null;
  id: string | null = null;
  layers: any[] = [];
  name: string | null = null;
  type: number = NodeType.CUSTOM;
  source: string | null = null;
  labelField: string | null = null;
  viewState: any = null;
  minZoom: number = 0;
  maxZoom: number = 18;
  tileSize: number = 256;
  isDemSource: boolean = false;

  static createFromData(data: Map.LayerData, _scene: any): MapNode {
    const node = new MapNode();
    node.scene = _scene;
    node.id = data.id;
    node.name = data.name;

    const category = data.category;
    const usage = data.usage;
    if (usage === null) return node;
    if (category === 'raster') {
      node.source = `http://${window.location.host}${import.meta.env.VITE_BACK_SERVER}/resource/raster/getRasterTile/${data.id}/{z}/{x}/{y}`;
      node.minZoom = Number.parseInt(usage.minZoom, 10);
      node.maxZoom = Number.parseInt(usage.maxZoom, 10);
      node.tileSize = Number.parseInt(usage.size, 10);

      if (usage.type === 'water') {
        node.type = NodeType.UNDERWATER;
        node.viewState = {
          center: [120.280392, 34.303044],
          zoom: 12,
          pitch: 0
        };
      } else {
        node.type = NodeType.RASTER;
        node.isDemSource = true;
      }
    } else if (category === 'vector') {
      node.labelField = usage.visualizationField.split(',')[0];
      node.source = `http://${window.location.host}${import.meta.env.VITE_BACK_SERVER}/resource/vector/getMVT/${data.id}/{z}/{x}/{y}`;
      if (usage.type === 'point') {
        node.type = NodeType.POINT;
      } else if (usage.type === 'line') {
        node.type = NodeType.LINE;
      } else {
        node.type = NodeType.POLYGON;
      }
    } else if (category === '3DTiles') {
      node.type = NodeType.THREED;
      node.source = `http://${window.location.host}${import.meta.env.VITE_BACK_SERVER}/resource/3DTiles/${data.id}/tileset.json`;
      node.viewState = {
        center: [119.134, 34.876],
        zoom: 11,
        bearing: -8.81,
        pitch: 70
      };
    } else {
      node.type = NodeType.CUSTOM;
    }

    node.genLayers();
    return node;
  }

  // 根据节点配置生成图层实例
  genLayers() {
    switch (this.type) {
      case NodeType.POINT: {
        this.addLayer(new PointLayer(this));
        this.addLayer(new LabelLayer(this));
        break;
      }
      case NodeType.LINE: {
        this.addLayer(new LineLayer(this));
        this.addLayer(new LabelLayer(this));
        break;
      }
      case NodeType.POLYGON: {
        this.addLayer(new PolygonLayer(this));
        this.addLayer(new LineLayer(this));
        this.addLayer(new LabelLayer(this));
        break;
      }
      case NodeType.RASTER: {
        this.addLayer(new RasterLayer(this));
        break;
      }
      case NodeType.CUSTOM: {
        this.addLayer(new CustomLayer(this));
        break;
      }
      default:
        break;
    }
  }

  loadAll() {
    if (this.type === NodeType.RASTER) {
      if (this.isDemSource === true) {
        this.map.addSource(this.id!, {
          type: 'raster-dem',
          tiles: [this.source!],
          tileSize: this.tileSize
        });
      } else {
        this.map.addSource(this.id!, {
          type: 'raster',
          tiles: [this.source!],
          tileSize: this.tileSize
        });
      }
    } else if (this.type === NodeType.POINT || this.type === NodeType.LINE || this.type === NodeType.POLYGON) {
      this.map.addSource(this.id!, {
        type: 'vector',
        schema: 'xyz',
        tiles: [this.source!]
      });
    }

    this.layers.forEach(layer => {
      layer.load();
    });
  }

  removeAll() {
    this.layers.forEach(layer => {
      layer.remove();
    });

    if (this.map.getSource(this.id)) this.map.removeSource(this.id!);
  }

  get map() {
    return this.scene.map;
  }

  get deckOverlay() {
    return this.scene.deckOverlay;
  }

  get isTerrain() {
    return this.scene.terrainId === this.id;
  }

  getLayer(i: number) {
    return this.layers[i];
  }

  addLayer(layer: any) {
    this.layers.push(layer);
    const index = this.layers.indexOf(layer);
    layer.id = this.id + index.toString();
    return index;
  }
}
