import MapLayer, { LayerType } from '../MapLayer';

export default class LabelLayer extends MapLayer {
  type: number = LayerType.LABEL;

  load() {
    if (!this.isGeojsonLayer) {
      this.map?.addLayer({
        id: this.id,
        type: 'symbol',
        source: this.sourceId,
        'source-layer': this.sourceName ?? undefined,
        minzoom: 0,
        maxzoom: 22,
        layout: {
          'text-field': ['get', this.labelField],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 0, 5, 7, 15, 12, 22, 28],
          'text-offset': [0, 1.5],
          'text-max-width': 10,
          'symbol-sort-key': 999
        },
        paint: this.genPaint()
      });
    }
  }

  remove() {
    if (this.map?.getLayer(this.id)) this.map.removeLayer(this.id);
  }

  get labelField() {
    return this.node.labelField;
  }
}
