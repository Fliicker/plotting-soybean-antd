import MapLayer, { LayerType } from '../MapLayer';

export default class PolygonLayer extends MapLayer {
  type: number = LayerType.POLYGON;

  load() {
    this.map?.addLayer({
      id: this.id,
      type: 'fill',
      source: this.sourceId,
      'source-layer': this.sourceName ?? undefined,
      minzoom: 0,
      maxzoom: 22,
      paint: this.genPaint()
    });
  }

  remove() {
    if (this.map?.getLayer(this.id)) this.map.removeLayer(this.id);
  }
}
