import MapLayer, { LayerType } from '../MapLayer';

export default class RasterLayer extends MapLayer {
  type: number = LayerType.RASTER;

  load() {
    console.log(`RasterLayer 加载: ${this.id}, 源ID: ${this.sourceId}`);

    try {
      // if (this.isDemLayer) {
      //   this.map?.setTerrain({ source: this.sourceId, exaggeration: 1.0 });
      // }
      // this.map?.addLayer({
      //   id: this.id,
      //   type: this.isDemLayer ? 'hillshade' : 'raster',
      //   paint: {
      //     'hillshade-accent-color': '#5a5a5a',
      //     'hillshade-exaggeration': 0.5,
      //     'hillshade-highlight-color': '#FFFFFF',
      //     'hillshade-illumination-anchor': 'viewport',
      //     'hillshade-illumination-direction': 335,
      //     'hillshade-shadow-color': '#5a5a5a'
      //   },
      //   source: this.sourceId,
      //   minzoom: 0,
      //   maxzoom: 22
      // });

      const layerConfig = {
        id: this.id,
        type: 'raster' as const,
        source: this.sourceId,
        minzoom: 0,
        maxzoom: 22
      };

      console.log('添加栅格图层配置:', layerConfig);
      // 如果需要在某个图层之前插入，可在外部控制；此处直接添加
      this.map?.addLayer(layerConfig);
      console.log(`栅格图层 ${this.id} 添加成功`);
    } catch (error) {
      console.error(`加载栅格图层 ${this.id} 时出错:`, error);
    }
  }

  remove() {
    // if (this.isDemLayer) {
    //   if (this.isTerrain) this.map?.setTerrain(null);
    // }
    if (this.map?.getLayer(this.id)) this.map.removeLayer(this.id);
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
