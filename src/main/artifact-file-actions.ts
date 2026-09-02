import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate)
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))
}

function existingDirectory(path: string): string {
  const resolved = realpathSync(resolve(path))
  if (!statSync(resolved).isDirectory()) throw new Error('artifact_scope_not_directory')
  return resolved
}

export function resolveArtifactFilePath({ artifactPath, exportDirectory, authorizedDirectories }: { artifactPath: string; exportDirectory: string; authorizedDirectories: string[] }): string {
  if (!artifactPath.trim()) throw new Error('artifact_path_missing')
  const exportRoot = existingDirectory(exportDirectory)
  const candidate = isAbsolute(artifactPath) ? resolve(artifactPath) : resolve(exportRoot, artifactPath)

  if (!isAbsolute(artifactPath) && !isWithin(exportRoot, candidate)) {
    throw new Error('artifact_path_outside_exports')
  }

  const existingPath = realpathSync(candidate)
  if (!statSync(existingPath).isFile()) throw new Error('artifact_path_not_file')
  if (isAbsolute(artifactPath)) {
    const authorizedRoots = authorizedDirectories.map(existingDirectory)
    if (!authorizedRoots.some((root) => isWithin(root, existingPath))) throw new Error('artifact_target_outside_scope')
  } else if (!isWithin(exportRoot, existingPath)) {
    throw new Error('artifact_target_outside_exports')
  }
  return existingPath
}
