import { basename, join, resolve } from 'node:path'

/** Keep destructive release assembly confined to an explicit build directory. */
export function releaseRoot(repository, args = process.argv.slice(2)) {
  if (args.includes('--release-root')) throw new Error('release_root_requires_equals')
  const option = args.find(value => value.startsWith('--release-root='))
  const root = resolve(option ? option.slice('--release-root='.length) : join(repository, 'build/local-release'))
  if (!root.startsWith(join(repository, 'build') + '/') || basename(root) !== 'local-release') throw new Error('unsafe_build_directory')
  return root
}
