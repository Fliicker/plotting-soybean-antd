declare module '@mapbox/search-js-web' {
  export class MapboxSearchBox {
    constructor(config?: {
      accessToken?: string;
      options?: any;
    });

    addEventListener(type: string, listener: (event: any) => void): void;
    removeEventListener(type: string, listener: (event: any) => void): void;

    onAdd?(map: any): HTMLElement;
    onRemove?(): void;
    getDefaultPosition?(): string;

    accessToken?: string;
    options?: any;
  }
}


