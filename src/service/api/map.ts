import { dataRequest } from '../request';

/** get layer tree */
export function fetchGetLayerTree() {
  return dataRequest<Api.Map.BaseTreeNode>({
    url: '/node/layerNode/getLayerTree',
    method: 'get'
  });
}
