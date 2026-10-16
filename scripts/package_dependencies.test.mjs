import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { externalPackageReferences } from './package_dependencies.mjs'

test('finds startup-critical vendor createRequire aliases and retains complete subpath specifiers', () => {
  const refs = externalPackageReferences(`import Module from 'node:module'; const require2=Module.createRequire(import.meta.url); const proto=require2('protobufjs/minimal'); import {createRequire as factory} from 'node:module';const local=factory(import.meta.url);local('@scope/example/subpath');`)
  assert.deepEqual(refs, [
    { specifier: 'protobufjs/minimal', packageName: 'protobufjs', kind: 'require', required: true },
    { specifier: '@scope/example/subpath', packageName: '@scope/example', kind: 'require', required: true }
  ])
})
test('keeps imports and uncaught requires mandatory while identifying caught optional native modules', () => {
  const refs = externalPackageReferences(`import 'jszip';import 'pdfjs-dist/legacy/build/pdf.mjs';export * from '@scope/pkg/path';try{require('bufferutil')}catch{};try{require('encoding')}finally{};function later(){require('needed')}await import('dynamic-package/file.js');`)
  assert.deepEqual(refs.map(r => [r.specifier, r.required]), [['jszip',true],['pdfjs-dist/legacy/build/pdf.mjs',true],['@scope/pkg/path',true],['bufferutil',false],['encoding',true],['needed',true],['dynamic-package/file.js',true]])
})
test('ignores Node/Electron, relative chunks, comments and string examples', () => {
  const refs = externalPackageReferences(`import 'node:fs';import 'path';import 'electron';import './chunk.js';const text='require("not-a-dependency")';/* import 'not-a-dependency-either' */function requireFake(){}requireFake('fake');`)
  assert.deepEqual(refs, [])
})
test('the retained compiled Main requires protobufjs despite having no static protobuf import', () => {
  const source = readFileSync(new URL('../out/main/index.js', import.meta.url), 'utf8')
  assert.ok(externalPackageReferences(source).some(r => r.specifier === 'protobufjs/minimal' && r.required))
})
