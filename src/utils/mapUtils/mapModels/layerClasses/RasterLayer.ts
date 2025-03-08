import MapLayer, { LayerType } from '../MapLayer';

export default class RasterLayer extends MapLayer {
  type: number = LayerType.RASTER;

  load() {
    if (this.isDemLayer) {
      this.map.setTerrain({ source: this.sourceId, exaggeration: 1.0 });
    }
    this.map.addLayer({
      id: this.id,
      type: this.isDemLayer ? 'hillshade' : 'raster',
      paint: {
        'hillshade-accent-color': '#5a5a5a',
        'hillshade-exaggeration': 0.5,
        'hillshade-highlight-color': '#FFFFFF',
        'hillshade-illumination-anchor': 'viewport',
        'hillshade-illumination-direction': 335,
        'hillshade-shadow-color': '#5a5a5a'
      },
      source: this.sourceId,
      minzoom: 0,
      maxzoom: 22
    });
  }

  remove() {
    if (this.isDemLayer) {
      if (this.isTerrain) this.map.setTerrain(null);
    }
    if (this.map.getLayer(this.id)) this.map.removeLayer(this.id);
  }

  get labelField() {
    return this.node.labelField;
  }

  get isDemLayer() {
    return this.node.isDemSource;
  }

  get isTerrain() {
    return this.node.isTerrain;
  }
}
