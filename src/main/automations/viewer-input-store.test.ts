import { expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ViewerInputStore } from './viewer-input-store'
it('persists immutable inputs and detects changed bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'viewer-input-'))
  try {
    const store = new ViewerInputStore(dir)
    const snapshot = {
      schemaVersion: 1 as const,
      scope: { workspaceId: 'w', pluginKey: 'p', panelId: 'v' },
      bindingRevision: 'b',
      datasetRevision: 'd',
      selectedItems: [{ id: 'a' }],
      text: 'Review',
      basePrompt: 'Base',
      effectivePrompt: 'Base Review',
      requestId: 'r'
    }
    const ref = store.write('run-1', snapshot)
    expect(new ViewerInputStore(dir).read(ref)).toEqual(snapshot)
    writeFileSync(join(dir, ref.relativePath), '{}')
    expect(() => store.read(ref)).toThrow('input_changed')
    expect(() => store.read({ relativePath: '../outside', sha256: 'a' })).toThrow(
      'invalid_input_path'
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
