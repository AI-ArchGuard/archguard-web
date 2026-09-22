// Aliases over the generated Platform OpenAPI v1 snapshot. Do not add domain logic here.
import type { components } from './schema'

type Schemas = components['schemas']
export type UUID = string
export type ProjectRole = Schemas['ProjectMemberRole']
export type Project = Schemas['Project']
export type Repository = Schemas['Repository']
export type RuleSet = Schemas['RuleSet']
export type RuleSetVersion = Schemas['RuleSetVersion']
export type ScanJob = Schemas['ScanJob']
export type ScanJobStatus = ScanJob['status']
export type ScanJobOutcome = ScanJob['outcome']
export type SourceLocation = Schemas['SourceLocation']
export type Finding = Schemas['Finding']
export type FindingDisposition = Schemas['FindingDisposition']
export type Evidence = Schemas['Evidence']
export type Disposition = Schemas['Disposition']
export type ApiError = Schemas['ApiError']
