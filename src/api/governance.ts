// Public aliases over fixed Platform OpenAPI snapshots; never hand-maintain response shapes.
import type { components as baselineComponents } from './baselines-schema'
import type { components as gateComponents } from './gates-schema'
import type { components as readComponents } from './governance-read-schema'

export type BaselineVersion = baselineComponents['schemas']['BaselineVersion']
export type PolicyException = gateComponents['schemas']['PolicyException']
export type GateEvaluation = readComponents['schemas']['GateEvaluation']
export type GatePage = readComponents['schemas']['GatePage']
export type PullRequest = readComponents['schemas']['PullRequest']
export type PullRequestPage = readComponents['schemas']['PullRequestPage']
export type Comparison = readComponents['schemas']['Comparison']
export type ClassifiedFinding = readComponents['schemas']['ClassifiedFinding']
