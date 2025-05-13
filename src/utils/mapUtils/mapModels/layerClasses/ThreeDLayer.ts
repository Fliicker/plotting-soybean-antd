import { Tile3DLayer } from 'deck.gl';
import { Tiles3DLoader } from '@loaders.gl/3d-tiles';
import type { Tileset3D } from '@loaders.gl/tiles';
import type { Layer } from 'deck.gl';
import MapLayer from '../MapLayer';

export default class ThreeDLayer extends MapLayer {
  load(): void {
    if (!this.deckOverlay) return;

    // eslint-disable-next-line no-underscore-dangle
    const currentLayers = (this.deckOverlay as any)._props?.layers || [];
    this.deckOverlay.setProps({
      layers: [
        ...currentLayers,
        new Tile3DLayer({
          id: this.id,
          name: this.id,
          data: this.sourceUrl || '',
          loader: Tiles3DLoader,
          extruded: true, // 设置3D功能
          opacity: 1, // 设置透明度
          loadOptions: {
            '3d-tiles': {
              loadGLTF: true,
              decodeQuantizedPositions: false,
              isTileset: 'auto',
              assetGltfUpAxis: null,
              workerUrl: null
            }
            // draco: {
            //   workerUrl: '/draco/dist/draco-worker.js' // 本地worker路径
            //   // workerUrl: `http://${window.location.host}/resource/draco/dist/draco-worker.js`,
            //   // wasmUrl: '/draco/dist/libs/draco_decoder.wasm', // 本地 wasm 文件
            //   // jsUrl: '/draco/dist/libs/draco/draco_decoder.js', // 或 JS 解码器（二选一）
            //   // decoderType: 'wasm'
            // },
            // CDN: false
          },
          pickable: true, // 设置可选取
          onTilesetError: (error: Error): void => {
            console.error('TilesetError:', error);
          },
          onTilesetLoad: (tileset: Tileset3D): void => {
            const center = tileset.cartographicCenter;
            if (center && this.deckOverlay) {
              (this.deckOverlay as any).setProps({
                initialViewState: {
                  longitude: center[0],
                  latitude: center[1],
                  transitionDuration: 1000
                }
              });
            }
          },
          pointSize: 2
        })
      ]
    });
  }

  remove(): void {
    if (!this.deckOverlay) return;

    // eslint-disable-next-line no-underscore-dangle
    const currentLayers = (this.deckOverlay as any)._props?.layers || [];
    const filteredLayers = currentLayers.filter((layer: Layer) => layer.id !== this.id);
    this.deckOverlay.setProps({ layers: filteredLayers });
  }
}
