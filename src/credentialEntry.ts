// 凭据入口展示开关：只控制页面和导航，部署所有者权限与管理开关仍由服务端校验。
// Presentation only; the configured backend owner and management gate remain authoritative.
export function credentialEntryEnabled(): boolean {
  return import.meta.env.VITE_CREDENTIAL_UI_ENABLED === 'true'
}
