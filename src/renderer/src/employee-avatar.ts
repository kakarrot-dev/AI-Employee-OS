import networkIntelligenceAvatar from './assets/employee-avatars/network-intelligence.png'
import documentWriterAvatar from './assets/employee-avatars/document-writer.png'
import supervisorAvatar from './assets/employee-avatars/supervisor.png'

export function supervisorIdentity(configuration?: { name?: string; avatarDataUrl?: string }): { name: string; initials: string; color: string; avatarSrc: string } {
  const name = configuration?.name?.trim() || '总管'
  return {
    name,
    initials: name.slice(0, 1),
    color: '#aebd83',
    avatarSrc: configuration?.avatarDataUrl || supervisorAvatar
  }
}

export function userIdentity(name: string, avatarSrc?: string | null): { name: string; initials: string; color: string; avatarSrc?: string | null } {
  const displayName = name.trim() || '本地用户'
  return { name: displayName, initials: displayName.slice(0, 1), color: '#d7b36a', avatarSrc }
}

const employeeAvatars: Record<string, string> = {
  'employee.network-intelligence': networkIntelligenceAvatar,
  'employee.document-writer': documentWriterAvatar
}

export function employeeAvatarSrc({ employeeId, avatarDataUrl }: { employeeId?: string; avatarDataUrl?: string }): string | undefined {
  return avatarDataUrl ?? (employeeId ? employeeAvatars[employeeId] : undefined)
}
