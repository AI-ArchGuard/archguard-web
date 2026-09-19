import { UserManager, WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts'

const settings: UserManagerSettings = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY ?? '/auth/realms/archguard',
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID ?? 'archguard-web',
  redirect_uri: import.meta.env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: import.meta.env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI ?? `${window.location.origin}/`,
  response_type: 'code',
  scope: 'openid profile project:create',
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
  monitorSession: false,
}

export const userManager = new UserManager(settings)
