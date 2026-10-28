// 普通页面的当前成员角色查询：分页查找 actorId，最多读取一百页；结果只辅助显示控件。
import { api } from './client'
import type { ProjectMember } from './types'

// 逐页查找当前用户的 Project 角色；未命中或到达读取上限返回 null，服务端仍负责每次操作授权。
export async function ownRole(projectId: string, actorId: string): Promise<ProjectMember['role'] | null> {
  for (let page = 0; page < 100; page++) {
    const members = await api<{ items: ProjectMember[]; total: number }>(`/api/v1/projects/${projectId}/members?page=${page}&size=100`)
    const member = members.items.find((item) => item.actorId === actorId)
    if (member) return member.role
    if ((page + 1) * 100 >= members.total) return null
  }
  return null
}
