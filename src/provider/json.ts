function escapeControlCharactersInsideStrings(value: string): string {
  let result = ''
  let insideString = false
  let escaped = false

  for (const character of value) {
    if (!insideString) {
      result += character
      if (character === '"') insideString = true
      continue
    }
    if (escaped) {
      result += character
      escaped = false
      continue
    }
    if (character === '\\') {
      result += character
      escaped = true
      continue
    }
    if (character === '"') {
      result += character
      insideString = false
      continue
    }
    const codePoint = character.codePointAt(0)!
    result += codePoint <= 0x1f ? JSON.stringify(character).slice(1, -1) : character
  }
  return result
}

export function parseToolArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string') throw new Error('invalid_tool_arguments')
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    try {
      parsed = JSON.parse(escapeControlCharactersInsideStrings(value))
    } catch {
      throw new Error('invalid_tool_arguments')
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_tool_arguments')
  return parsed as Record<string, unknown>
}
