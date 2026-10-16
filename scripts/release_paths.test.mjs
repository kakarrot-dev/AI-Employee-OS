import assert from 'node:assert/strict'
import { test } from 'node:test'
import { releaseRoot } from './release_paths.mjs'

test('isolated release output and original default stay inside the repository build directory', () => {
  assert.equal(releaseRoot('/repo', []), '/repo/build/local-release')
  assert.equal(releaseRoot('/repo', ['--release-root=/repo/build/verification/local-release']), '/repo/build/verification/local-release')
  for (const target of ['/repo', '/tmp/local-release', '/repo/build/other', '/repo/build/../../local-release', '']) {
    assert.throws(() => releaseRoot('/repo', [`--release-root=${target}`]), /unsafe_build_directory/)
  }
  assert.throws(() => releaseRoot('/repo', ['--release-root']), /release_root_requires_equals/)
})
