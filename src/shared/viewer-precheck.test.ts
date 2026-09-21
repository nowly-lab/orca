import { expect, it } from 'vitest'
import { shouldRunAutomationPrecheck } from './automation-precheck'
it('preserves manual bypass but checks scheduled and viewer runs', () => {
  expect(shouldRunAutomationPrecheck({ trigger: 'manual' })).toBe(false)
  expect(shouldRunAutomationPrecheck({ trigger: 'scheduled' })).toBe(true)
  expect(
    shouldRunAutomationPrecheck({
      trigger: 'manual',
      viewer: {
        scope: { workspaceId: 'a', pluginKey: 'nowly.demo', panelId: 'p' },
        requestId: 'r',
        input: { relativePath: 'r.json', sha256: 'hash' }
      }
    })
  ).toBe(true)
})
