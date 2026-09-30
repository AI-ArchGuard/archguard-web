// Public aliases over the fixed Platform 4C/4E OpenAPI snapshots.
import type { components as agentComponents } from './agent-schema'
import type { components as documentComponents } from './agent-documents-schema'

export type AgentRequest = agentComponents['schemas']['AgentRequest']
export type CreateAgentRequest = agentComponents['schemas']['CreateAgentRequest']
export type VerifiedCitation = agentComponents['schemas']['VerifiedCitation']
export type DocumentPage = documentComponents['schemas']['DocumentPage']
export type DocumentSummary = documentComponents['schemas']['DocumentSummary']
export type DocumentVersionPage = documentComponents['schemas']['DocumentVersionPage']
export type DocumentVersion = documentComponents['schemas']['DocumentVersion']
