// 回退为前端模拟实现

export interface LoginPayload {
  userName: string;
  password: string;
}

export interface LoginToken {
  token: string;
  refreshToken?: string;
}

export interface UserInfo {
  userId: string;
  userName: string;
  roles: string[];
}

export async function fetchLogin(payload: LoginPayload): Promise<LoginToken> {
  const token = btoa(`${payload.userName}:${Date.now()}`);
  return Promise.resolve({ token, refreshToken: token });
}

export async function fetchGetUserInfo(userName: string): Promise<UserInfo> {
  const isAdmin = userName?.toLowerCase() === 'admin';
  return Promise.resolve({ userId: userName, userName, roles: [isAdmin ? 'ADMIN' : 'USER'] });
}

export async function fetchRefreshToken(refreshToken: string): Promise<LoginToken> {
  // 模拟刷新token，直接返回相同的token
  return Promise.resolve({ token: refreshToken, refreshToken });
}

