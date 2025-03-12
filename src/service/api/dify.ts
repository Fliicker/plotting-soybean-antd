import { difyRequest } from '../request';

/** get layer tree */
export function fetchDifyResponse(query: string) {
  return difyRequest<Api.Dify.DifyResponse>({
    url: '/chat-messages',
    method: 'post',
    data: {
      inputs: {},
      query,
      response_mode: 'blocking',
      user: '1'
    }
  });
}
