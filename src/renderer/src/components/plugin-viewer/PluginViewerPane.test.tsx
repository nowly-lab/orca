// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import PluginViewerPane from './PluginViewerPane'
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('../plugin-panels/PluginPanelFrame', () => ({ default: () => <div>Viewer content</div> }))
vi.mock('./ViewerRunHistory', () => ({ ViewerRunHistory: () => <div>Run history</div> }))
afterEach(cleanup)
const scope = { workspaceId: 'workspace', pluginKey: 'nowly.demo', panelId: 'list' }
it('explains that a remote host is unsupported without mounting plugin content', async () => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      plugins: { viewerSettings: vi.fn().mockRejectedValue(new Error('unsupported_viewer_host')) }
    }
  })
  render(<PluginViewerPane workspaceId="workspace" entityId={JSON.stringify(scope)} isVisible />)
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Custom viewers are available on the local desktop only.'
  )
  expect(screen.queryByText('Viewer content')).toBeNull()
})
it('renders the ready viewer and refuses an entity belonging to another workspace', async () => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      plugins: {
        viewerSettings: vi.fn().mockResolvedValue({
          configured: true,
          datasetRelativePath: 'items.json',
          automationId: 'a',
          automations: [{ id: 'a', name: 'Example' }]
        })
      }
    }
  })
  const view = render(
    <PluginViewerPane workspaceId="workspace" entityId={JSON.stringify(scope)} isVisible />
  )
  expect(await screen.findByText('Viewer content')).toBeTruthy()
  view.rerender(<PluginViewerPane workspaceId="other" entityId={JSON.stringify(scope)} isVisible />)
  expect(screen.getByText('This viewer is unavailable.')).toBeTruthy()
  expect(screen.queryByText('Viewer content')).toBeNull()
})
