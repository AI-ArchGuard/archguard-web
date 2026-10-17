// Independent presentation switch; never a permission or provider spending grant.
export function personalAgentEntryEnabled(): boolean {
  return import.meta.env.VITE_AGENT_UI_ENABLED === 'true' && import.meta.env.VITE_AGENT_LIVE_UI_ENABLED === 'true'
}
