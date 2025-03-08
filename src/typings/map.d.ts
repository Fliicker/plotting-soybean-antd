declare namespace Map {
  interface BaseTreeNode {
    id: string;
    layerName: string | null;
    tableName: string | null;
    category: string | null;
    usage: any;
    children: BaseTreeNode[];
    [key: string]: any;
  }

  type LayerData = Omit<BaseTreeNode, 'layerName' | 'tableName'> & {
    name: string | null;
    name_cn: string | null;
    children: LayerData[];
  };
}
