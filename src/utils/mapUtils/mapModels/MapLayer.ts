import type MapNode from './MapNode';

export const LayerType = {
  POINT: 0,
  LINE: 1,
  POLYGON: 2,
  LABEL: 3,
  RASTER: 4,
  THREED: 5,
  UNDERWATER: 6,
  CUSTOM: 7
};

export default abstract class MapLayer {
  id: string = '';
  type: number = LayerType.CUSTOM;
  node: MapNode;

  constructor(_node: any) {
    this.node = _node;
  }

  // 添加图层
  abstract load(): void;

  abstract remove(): void;

  open(): void {
    if (this.map?.getLayer(this.id)) {
      this.map.setLayoutProperty(this.id, 'visibility', 'visible');
    }
  }

  close(): void {
    if (this.map?.getLayer(this.id)) {
      this.map.setLayoutProperty(this.id, 'visibility', 'none');
    }
  }

  genPaint() {
    switch (this.type) {
      case LayerType.POINT:
        return {
          'circle-radius': 4,
          'circle-color': '#007cbf',
          'circle-opacity': 0.8,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff'
        };
      case LayerType.LINE:
        return {
          'line-width': 2,
          'line-color': '#029BDD',
          'line-opacity': 0.8
        };

      case LayerType.POLYGON:
        return {
          'fill-color': '#04EB13',
          'fill-opacity': 0.6,
          'fill-outline-color': '#000000'
        };

      case LayerType.LABEL:
        return {
          'text-color': '#630080',
          'text-halo-color': '#fff',
          'text-opacity': ['step', ['zoom'], 0, 10, 1],
          'text-halo-width': ['interpolate', ['linear'], ['zoom'], 1, 0, 5, 0.2, 9, 0.1, 10, 0.5, 22, 1]
        };

      default:
        console.warn('Unsupported geometry type:', this.type);
        return {};
    }
  }

  get map() {
    return this.node.map;
  }

  get sourceId() {
    return this.node.id;
  }

  get sourceUrl() {
    return this.node.source;
  }

  get sourceName() {
    return this.node.name;
  }

  get deckOverlay() {
    return this.node.deckOverlay;
  }
}
