import { employeeAvatarSrc } from './employee-avatar'

interface ExpertGroupAvatarMember {
  id?: string
  employeeId?: string
  name: string
  avatarDataUrl?: string
}

const memberColors = ['#b6c49a', '#c5b8e3', '#d7b36a']

export function ExpertGroupAvatar({ name, members, size = 'small' }: { name: string; members: ExpertGroupAvatarMember[]; size?: 'small' | 'medium' | 'large' }): React.JSX.Element {
  const visibleMembers = members.slice(0, 3)
  const avatarMembers = visibleMembers.length > 0 ? visibleMembers : [{ name }]
  const memberNames = visibleMembers.map((member) => member.name).join('、')
  const accessibleLabel = memberNames ? `${name}组合头像，成员：${memberNames}` : `${name}组合头像`

  return <span className={`expert-group-avatar expert-group-avatar--${size}`} role="img" aria-label={accessibleLabel}>
    {avatarMembers.map((member, index) => {
      const employeeId = member.employeeId ?? member.id
      const src = employeeAvatarSrc({ employeeId, avatarDataUrl: member.avatarDataUrl })
      return <span
        aria-hidden="true"
        className="expert-group-avatar__member"
        key={employeeId ?? `${member.name}-${index}`}
        style={{ '--group-member-color': memberColors[index % memberColors.length] } as React.CSSProperties}
      >{src ? <img src={src} alt="" /> : member.name.trim().slice(0, 1)}</span>
    })}
  </span>
}
