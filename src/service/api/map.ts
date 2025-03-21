import { dataRequest, dataRequestFlat } from '../request';

/** get layer tree */
export function fetchGetLayerTree() {
  return dataRequest<Api.Map.BaseTreeNode>({
    url: '/node/layerNode/getLayerTree',
    method: 'get'
  });
}

/** get workflow result */
export function fetchGetWorkflowResult(workflow: any) {
  return dataRequestFlat<Api.Map.WorkflowResult>({
    url: '/workflow/execute',
    method: 'post',
    data: workflow
  });
}
