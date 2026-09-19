import { useMemo } from 'react'
import { usePluginPanels } from '@/store/plugin-panels'
import {
  buildTabCreateMenuOptions,
  type TabCreateMenuOptionsContext
} from './tab-create-menu-options'

export function useTabCreateMenuOptions(
  context: Omit<TabCreateMenuOptionsContext, 'viewerPanels'>
) {
  const panels = usePluginPanels()
  const {
    terminalOnly,
    windowsShellEntries,
    hasNewBrowser,
    hasNewMarkdown,
    hasOpenMarkdown,
    hasSimulator,
    simulatorIsGoTo
  } = context
  return useMemo(
    () =>
      buildTabCreateMenuOptions({
        viewerPanels: panels,
        terminalOnly,
        windowsShellEntries,
        hasNewBrowser,
        hasNewMarkdown,
        hasOpenMarkdown,
        hasSimulator,
        simulatorIsGoTo
      }),
    [
      panels,
      terminalOnly,
      windowsShellEntries,
      hasNewBrowser,
      hasNewMarkdown,
      hasOpenMarkdown,
      hasSimulator,
      simulatorIsGoTo
    ]
  )
}
