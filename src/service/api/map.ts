import { apiRequest } from '../request';

/** get layer tree */
export function fetchGetLayerTree() {
  return apiRequest<Api.Map.BaseTreeNode>({
    url: '/node/layerNode/getLayerTree',
    method: 'get'
  });
}
