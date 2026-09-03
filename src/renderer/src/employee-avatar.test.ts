import { describe, expect, it } from 'vitest'
import { employeeAvatarSrc } from './employee-avatar'

describe('employeeAvatarSrc', () => {
  it('returns the built-in tender analyst avatar', () => {
    expect(employeeAvatarSrc({ employeeId: 'employee.tender-analyst' })).toContain('tender-analyst.png')
  })

  it('prefers a configured avatar over the built-in avatar', () => {
    expect(
      employeeAvatarSrc({
        employeeId: 'employee.tender-analyst',
        avatarDataUrl: 'data:image/png;base64,custom-avatar'
      })
    ).toBe('data:image/png;base64,custom-avatar')
  })
})
