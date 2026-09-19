import { expect, it } from 'vitest'
import { resolveViewerWorkspaceProject } from './viewer-workspace-project'
import type { FolderWorkspaceHostState } from '../../shared/folder-workspace-execution-host'
const repo = {
  id: 'repo',
  path: '/root/repo',
  displayName: 'Repo',
  badgeColor: '#fff',
  addedAt: 1,
  projectGroupId: 'group'
}
const folder = {
  id: 'folder',
  projectGroupId: 'group',
  name: 'Folder',
  folderPath: '/root',
  linkedTask: null,
  comment: '',
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 1,
  createdAt: 1,
  updatedAt: 1
}
const state: FolderWorkspaceHostState = {
  repos: [repo, { ...repo, id: 'elsewhere', projectGroupId: 'other' }],
  folderWorkspaces: [folder],
  projectGroups: [
    {
      id: 'group',
      name: 'Project',
      parentPath: '/root',
      parentGroupId: null,
      createdFrom: 'manual',
      tabOrder: 0,
      isCollapsed: false,
      color: null,
      createdAt: 1,
      updatedAt: 1
    }
  ]
}
it('binds git workspaces to their repo and local folders to repositories in their project group', () => {
  expect(
    resolveViewerWorkspaceProject({ repo, folderWorkspace: null, connectionId: null }, state)
      .repoIds
  ).toEqual(['repo'])
  expect(
    resolveViewerWorkspaceProject(
      { repo: null, folderWorkspace: folder, connectionId: null },
      state
    )
  ).toEqual({ repoIds: ['repo'], projectName: 'Project' })
})
it('rejects remote and floating workspaces instead of falling back to local execution', () => {
  expect(() =>
    resolveViewerWorkspaceProject(
      {
        repo: { ...repo, executionHostId: 'ssh:remote' },
        folderWorkspace: null,
        connectionId: null
      },
      state
    )
  ).toThrow('unsupported_viewer_host')
  expect(() =>
    resolveViewerWorkspaceProject(
      {
        repo: null,
        folderWorkspace: { ...folder, executionHostId: 'ssh:remote' },
        connectionId: null
      },
      state
    )
  ).toThrow('unsupported_viewer_host')
  expect(() =>
    resolveViewerWorkspaceProject({ repo: null, folderWorkspace: null, connectionId: null }, state)
  ).toThrow('unsupported_viewer_host')
})
