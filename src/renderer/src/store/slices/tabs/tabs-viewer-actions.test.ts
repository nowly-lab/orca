import { buildMobileSessionWorktreeInputs } from '@/runtime/sync-runtime-graph/mobile-session-inputs'
import { buildMobileSessionGroupProjection } from '@/runtime/sync-runtime-graph/mobile-session-group-projection'
import { describe, it, expect } from 'vitest'
import { createTestStore } from '../store-test-helpers'
import { createTabsSliceMockApi } from '../tabs-slice-test-harness'
import { openViewerTab } from './tabs-viewer-actions'
import { buildPersistedUnifiedTabSessionData } from '@/lib/workspace-session-unified-tabs'
import { getDefaultWorkspaceSession } from '../../../../../shared/constants'
import { buildHydratedTabState } from '../tabs-hydration'
createTabsSliceMockApi()

describe('workspace viewer tabs', () => {
  it('reuses a tab in one workspace and preserves it through reconcile, pin, persistence, hydration and close', () => {
    const store = createTestStore()
    const input = {
      workspaceId: 'workspace',
      pluginKey: 'nowly.demo',
      panelId: 'list',
      title: 'Viewer'
    }
    const id = openViewerTab(store.getState(), input)
    expect(openViewerTab(store.getState(), input)).toBe(id)
    const other = openViewerTab(store.getState(), { ...input, workspaceId: 'other' })
    expect(other).not.toBe(id)
    store.getState().pinTab(id)
    store.getState().reconcileWorktreeTabModel('workspace')
    expect(store.getState().getTab(id)).toMatchObject({
      contentType: 'plugin-viewer',
      isPinned: true
    })
    const persisted = buildPersistedUnifiedTabSessionData(store.getState())
    const restored = buildHydratedTabState(
      { ...getDefaultWorkspaceSession(), ...persisted },
      new Set(['workspace', 'other'])
    )
    expect(restored.unifiedTabsByWorktree.workspace[0]).toMatchObject({
      id,
      contentType: 'plugin-viewer',
      isPinned: true
    })
    store.getState().closeUnifiedTab(id)
    expect(store.getState().getTab(id)).toBeNull()
    expect(store.getState().openFiles).toEqual([])
  })
})

it('excludes viewer tabs from shared session groups while preserving ordinary tabs', () => {
  const store = createTestStore()
  const viewerId = openViewerTab(store.getState(), {
    workspaceId: 'workspace',
    pluginKey: 'nowly.demo',
    panelId: 'list',
    title: 'Viewer'
  })
  const terminal = store
    .getState()
    .createUnifiedTab('workspace', 'terminal', { entityId: 'terminal', label: 'Shell' })
  const state = store.getState()
  const inputs = buildMobileSessionWorktreeInputs(
    state,
    'workspace',
    {
      browserTabsByWorktree: {},
      openFileIndexes: { byWorktreeAndId: new Map(), idsByWorktree: new Map() },
      editorDraftVersionByFileId: new Map(),
      agentStatusByWorktreeId: new Map(),
      generatedTitlesEnabled: false,
      terminalTheme: undefined
    },
    new Set()
  )
  const projection = buildMobileSessionGroupProjection(inputs, {
    terminalIds: ['terminal'],
    editorIds: [],
    browserIds: []
  })
  expect(JSON.stringify(projection)).not.toContain(viewerId)
  expect(projection.tabGroups?.flatMap((group) => group.tabOrder)).toContain(terminal.id)
})
