// Agent 展示开关：仅构建值精确为 true 时开放入口；后台权限与模型控制仍由 Platform 决定。
// Presentation switch only; Platform authorization and model controls remain authoritative.
// Missing or malformed build configuration always hides Agent entry points.
export function agentEntryEnabled(): boolean {
  return import.meta.env.VITE_AGENT_UI_ENABLED === 'true'
}
