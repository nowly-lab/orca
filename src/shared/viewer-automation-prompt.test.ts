import { expect, it } from 'vitest'
import { composeViewerAutomationPrompt } from './viewer-automation-prompt'
it('encodes selected records and instructions without evaluating their contents', () => {
  const text = 'line1\n$(echo example)'
  expect(composeViewerAutomationPrompt('Review.', [{ id: 'a' }], text)).toContain(
    JSON.stringify({ selectedItems: [{ id: 'a' }], text })
  )
})
