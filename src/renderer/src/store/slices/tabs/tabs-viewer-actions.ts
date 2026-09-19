import { viewerScopeKey, type ViewerScope } from '../../../../../shared/plugins/viewer-contract'
import type { TabsSlice } from './tabs-slice-contract'

export function openViewerTab(
  state: Pick<TabsSlice, 'unifiedTabsByWorktree' | 'activateTab' | 'createUnifiedTab'>,
  input: ViewerScope & { title: string }
): string {
  const scope: ViewerScope = {
    workspaceId: input.workspaceId,
    pluginKey: input.pluginKey,
    panelId: input.panelId
  }
  const entityId = JSON.stringify(scope)
  const existing = (state.unifiedTabsByWorktree[input.workspaceId] ?? []).find(
    (tab) => tab.contentType === 'plugin-viewer' && tab.entityId === entityId
  )
  if (existing) {
    state.activateTab(existing.id)
    return existing.id
  }
  const tab = state.createUnifiedTab(input.workspaceId, 'plugin-viewer', {
    entityId,
    label: input.title,
    id: `viewer:${viewerScopeKey(scope)}`,
    executionHostId: 'local',
    recordInteraction: false
  })
  state.activateTab(tab.id)
  return tab.id
}
