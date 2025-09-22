import { dataRequest } from '../request';

/** get layer tree */
export function fetchGetLayerTree() {
  return dataRequest<Api.Map.BaseTreeNode>({
    url: '/node/layerNode/getLayerTree',
    method: 'get'
  });
}

// 新增：获取矢量层全部列
export function fetchVectorColumns(id: string) {
  console.log('fetchVectorColumns 调用，ID:', id, '完整URL:', `/resource/vector/columns/${id}`);
  return dataRequest<string[]>({ url: `/resource/vector/columns/${id}`, method: 'get' });
}

// 新增：分页获取矢量属性
export function fetchVectorAttributes(id: string, params: { columns: string[]; page: number; size: number }) {
  return dataRequest<any[]>({
    url: `/resource/vector/attributes/${id}`,
    method: 'post',
    data: { columns: params.columns, page: params.page, size: params.size }
  });
}

// 新增：总行数
export function fetchVectorRowCount(id: string) {
  return dataRequest<number>({ url: `/resource/vector/rowCount/${id}`, method: 'get' });
}
