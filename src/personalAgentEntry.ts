// 个人真实验收入口要求两个独立展示开关同时精确开启；页面可见不代表获得权限或费用授权。
// Independent presentation switch; never a permission or provider spending grant.
export function personalAgentEntryEnabled(): boolean {
  return import.meta.env.VITE_AGENT_UI_ENABLED === 'true' && import.meta.env.VITE_AGENT_LIVE_UI_ENABLED === 'true'
}
