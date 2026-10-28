// OIDC 客户端配置：授权码登录沿既有身份代理执行，用户令牌和协议状态只存于当前标签页 sessionStorage。
import { UserManager, WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts'

const settings: UserManagerSettings = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY ?? '/auth/realms/archguard',
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID ?? 'archguard-web',
  redirect_uri: import.meta.env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: import.meta.env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI ?? `${window.location.origin}/`,
  response_type: 'code',
  scope: 'openid project:create',
  // 用户令牌与 OIDC 协议临时状态都限定在当前标签页，避免跨浏览器会话持久化。
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
  monitorSession: false,
}

export const userManager = new UserManager(settings)
