import { getRepoExecutionHostId } from '../../shared/execution-host'
import { getProjectGroupSubtreeIds } from '../../shared/project-groups'
import {
  resolveFolderWorkspaceHost,
  type FolderWorkspaceHostState
} from '../../shared/folder-workspace-execution-host'
import type { TerminalWorkspaceLaunchScope } from '../runtime/runtime-legacy-worker-terminal-recovery-types'

export function resolveViewerWorkspaceProject(
  target: Pick<TerminalWorkspaceLaunchScope, 'repo' | 'folderWorkspace' | 'connectionId'>,
  state: FolderWorkspaceHostState
): { repoIds: string[]; projectName: string } {
  if (target.connectionId) {
    throw new Error('unsupported_viewer_host')
  }
  if (target.repo) {
    if (getRepoExecutionHostId(target.repo) !== 'local') {
      throw new Error('unsupported_viewer_host')
    }
    return { repoIds: [target.repo.id], projectName: target.repo.displayName }
  }
  const folder = target.folderWorkspace
  if (
    !folder ||
    (folder.executionHostId && folder.executionHostId !== 'local') ||
    resolveFolderWorkspaceHost(state, folder.id).kind !== 'local'
  ) {
    throw new Error('unsupported_viewer_host')
  }
  const group = state.projectGroups.find((row) => row.id === folder.projectGroupId)
  if (!group || (group.executionHostId && group.executionHostId !== 'local')) {
    throw new Error('unsupported_viewer_host')
  }
  const groups = getProjectGroupSubtreeIds(state.projectGroups, group.id)
  return {
    repoIds: state.repos
      .filter(
        (repo) =>
          repo.projectGroupId &&
          groups.has(repo.projectGroupId) &&
          getRepoExecutionHostId(repo) === 'local'
      )
      .map((repo) => repo.id),
    projectName: group.name
  }
}
