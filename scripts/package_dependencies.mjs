import { isBuiltin } from 'node:module'
import { parseAst } from 'rollup/parseAst'

function visit(node, work) {
  if (!node || typeof node !== 'object') return
  work(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => visit(child, work))
    else if (value && typeof value === 'object') visit(value, work)
  }
}

/** Discover emitted dependencies, including createRequire aliases left by vendor ESM. */
export function externalPackageReferences(source) {
  const ast = parseAst(source), moduleNamespaces = new Set(), factories = new Set(), requires = new Set(['require'])
  for (const statement of ast.body) {
    if (statement.type !== 'ImportDeclaration' || !['module', 'node:module'].includes(statement.source.value)) continue
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'createRequire') factories.add(specifier.local.name)
      else if (specifier.type !== 'ImportSpecifier') moduleNamespaces.add(specifier.local.name)
    }
  }
  visit(ast, node => {
    if (node.type !== 'VariableDeclarator' || node.id.type !== 'Identifier' || node.init?.type !== 'CallExpression') return
    const callee = node.init.callee
    if ((callee.type === 'Identifier' && factories.has(callee.name)) || (callee.type === 'MemberExpression' && moduleNamespaces.has(callee.object.name) && callee.property.name === 'createRequire')) requires.add(node.id.name)
  })
  const references = []
  function scan(node, caught = false) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'TryStatement') {
      scan(node.block, caught || Boolean(node.handler)); scan(node.handler, caught); scan(node.finalizer, caught)
      return
    }
    let specifier, kind
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) { specifier = node.source.value; kind = 'import' }
    if (node.type === 'ImportExpression' && node.source.type === 'Literal') { specifier = node.source.value; kind = 'dynamic_import' }
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && requires.has(node.callee.name) && node.arguments[0]?.type === 'Literal') { specifier = node.arguments[0].value; kind = 'require' }
    if (typeof specifier === 'string' && specifier !== 'electron' && !isBuiltin(specifier) && !specifier.startsWith('.') && !specifier.startsWith('/')) {
      const parts = specifier.split('/')
      references.push({ specifier, packageName: specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0], kind, required: kind === 'import' || !caught })
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => scan(child, caught))
      else if (value && typeof value === 'object') scan(value, caught)
    }
  }
  scan(ast)
  return references
}
