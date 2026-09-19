import type { ActivePluginPanel } from '@/store/plugin-panels'
import { openViewerTab } from '@/store/slices/tabs/tabs-viewer-actions'
import type { TabCreateMenuOption } from './tab-create-menu-options'

export function buildViewerTabMenuOptions(
  panels: ActivePluginPanel[],
  terminalOnly: boolean
): TabCreateMenuOption[] {
  return terminalOnly
    ? []
    : panels
        .filter((panel) => panel.placement === 'tab')
        .map((panel) => ({
          id: panel.tabKey,
          kind: 'plugin-viewer',
          label: panel.title,
          keywords: ['viewer', panel.pluginName],
          viewer: { pluginKey: panel.pluginKey, panelId: panel.id }
        }))
}
export function openViewerMenuOption(
  state: Parameters<typeof openViewerTab>[0],
  workspaceId: string,
  option: TabCreateMenuOption
): void {
  if (option.viewer) {
    openViewerTab(state, { workspaceId, ...option.viewer, title: option.label })
  }
}
