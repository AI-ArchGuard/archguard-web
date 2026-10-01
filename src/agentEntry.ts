// Presentation switch only; Platform authorization and model controls remain authoritative.
// Missing or malformed build configuration always hides Agent entry points.
export function agentEntryEnabled(): boolean {
  return import.meta.env.VITE_AGENT_UI_ENABLED === 'true'
}
