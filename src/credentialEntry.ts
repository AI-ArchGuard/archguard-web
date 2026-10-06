// Presentation only; the configured backend owner and management gate remain authoritative.
export function credentialEntryEnabled(): boolean {
  return import.meta.env.VITE_CREDENTIAL_UI_ENABLED === 'true'
}
