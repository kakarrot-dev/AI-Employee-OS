/** Poe/Anthropic rejects uniqueItems in native output schemas. Enforce it locally instead. */
export function poeOutputSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const { uniqueItems: _uniqueItems, ...wire } = schema
  // Anthropic accepts an exclusive anyOf node, not an intersection with sibling object fields.
  // Our route schema shares one flat object contract and narrows individual fields per mode.
  if (Array.isArray(wire.anyOf) && wire.properties && typeof wire.properties === 'object') {
    const { anyOf, properties, ...object } = wire
    return { anyOf: anyOf.map((value) => {
      const branch = value as Record<string, unknown>
      const narrowed = (branch.properties ?? {}) as Record<string, Record<string, unknown>>
      return poeOutputSchema({ ...object, ...branch, properties: Object.fromEntries(Object.entries(properties).map(([key, field]) => [key, { ...(field as Record<string, unknown>), ...narrowed[key] }])) })
    }) }
  }
  if (Array.isArray(wire.anyOf)) wire.anyOf = wire.anyOf.map(child => poeOutputSchema(child as Record<string, unknown>))
  if (wire.properties && typeof wire.properties === 'object') wire.properties = Object.fromEntries(Object.entries(wire.properties).map(([key, child]) => [key, poeOutputSchema(child as Record<string, unknown>)]))
  if (wire.items && typeof wire.items === 'object' && !Array.isArray(wire.items)) wire.items = poeOutputSchema(wire.items as Record<string, unknown>)
  return wire
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`
  return JSON.stringify(value)
}

export function assertPoeUniqueItems(schema: Record<string, unknown>, value: unknown): void {
  if (Array.isArray(value)) {
    if (schema.uniqueItems === true && new Set(value.map(canonical)).size !== value.length) throw new Error('invalid_structured_output')
    if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) for (const item of value) assertPoeUniqueItems(schema.items as Record<string, unknown>, item)
  } else if (value && typeof value === 'object' && schema.properties && typeof schema.properties === 'object') {
    for (const [key, child] of Object.entries(schema.properties)) if (key in value) assertPoeUniqueItems(child as Record<string, unknown>, (value as Record<string, unknown>)[key])
  }
}
