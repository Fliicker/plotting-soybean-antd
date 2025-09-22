import MapLayer, { LayerType } from '../MapLayer';

export default class PointLayer extends MapLayer {
  type: number = LayerType.POINT;

  load() {
    if (this.isGeojsonLayer) {
      this.map?.addLayer({
        id: this.id,
        type: 'circle',
        source: this.sourceId,
        paint: this.genPaint()
      });
    } else {
      this.map?.addLayer({
        id: this.id,
        type: 'circle',
        source: this.sourceId,
        'source-layer': this.sourceName ?? undefined,
        minzoom: 0,
        maxzoom: 22,
        paint: this.genPaint()
      });
    }
  }

  remove() {
    if (this.map?.getLayer(this.id)) this.map.removeLayer(this.id);
  }
}
