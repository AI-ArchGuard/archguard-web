import { api } from './client'
import type { ProjectMember } from './types'

export async function ownRole(projectId: string, actorId: string): Promise<ProjectMember['role'] | null> {
  for (let page = 0; page < 100; page++) {
    const members = await api<{ items: ProjectMember[]; total: number }>(`/api/v1/projects/${projectId}/members?page=${page}&size=100`)
    const member = members.items.find((item) => item.actorId === actorId)
    if (member) return member.role
    if ((page + 1) * 100 >= members.total) return null
  }
  return null
}
