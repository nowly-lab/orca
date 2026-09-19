import { describe, expect, it } from 'vitest'
import { viewerDispatchInputSchema } from './viewer-contract'
import { pluginManifestSchema } from './plugin-manifest'

const input = {
  requestId: 'request-1',
  requestedAt: 1,
  bindingRevision: 'binding-1',
  datasetRevision: 'dataset-1',
  selectedIds: ['a'],
  text: ''
}
describe('viewer contracts', () => {
  it('accepts selection or instructions but rejects an empty submission', () => {
    expect(viewerDispatchInputSchema.safeParse(input).success).toBe(true)
    expect(
      viewerDispatchInputSchema.safeParse({
        ...input,
        selectedIds: [],
        text: 'Review'
      }).success
    ).toBe(true)
    expect(viewerDispatchInputSchema.safeParse({ ...input, selectedIds: [] }).success).toBe(false)
  })
  it('rejects duplicate, oversized and caller-selected targets', () => {
    for (const change of [
      { selectedIds: ['a', 'a'] },
      { selectedIds: Array.from({ length: 101 }, (_, i) => String(i)) },
      { selectedIds: ['a'.repeat(129)] },
      { text: 'x'.repeat(8193) },
      { automationId: 'other' }
    ]) {
      expect(viewerDispatchInputSchema.safeParse({ ...input, ...change }).success).toBe(false)
    }
  })
  it('defaults old panels to sidebar and preserves opted-in tabs', () => {
    const manifest = {
      manifestVersion: 1,
      id: 'demo',
      publisher: 'local',
      name: 'Demo',
      version: '1.0.0',
      engines: { orca: '>=0.0.0' },
      pluginApi: 1,
      contributes: {
        panels: [
          { id: 'old', title: 'Old', entry: 'old.html' },
          { id: 'new', title: 'New', entry: 'new.html', placement: 'tab' }
        ]
      }
    }
    expect(
      pluginManifestSchema.parse(manifest).contributes.panels.map((p) => p.placement ?? 'sidebar')
    ).toEqual(['sidebar', 'tab'])
  })
})
