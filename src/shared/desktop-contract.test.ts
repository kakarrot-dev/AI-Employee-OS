import { describe, expect, it } from 'vitest'
import { clipboardText } from './desktop-contract'

describe('desktop copy boundary', () => {
  it('preserves code whitespace and accepts an empty selection', () => {
    const code = '\n  const title = "中文";\n\n'
    expect(clipboardText(code)).toBe(code)
    expect(clipboardText('')).toBe('')
  })

  it('rejects non-text and oversized renderer payloads', () => {
    for (const value of [null, undefined, 42, {}, ['text'], 'x'.repeat(1_000_001)]) expect(() => clipboardText(value)).toThrow('invalid_clipboard_text')
  })
})
