import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ViewerBindingStore } from './viewer-binding-store'
import { ViewerHostMethods } from './viewer-host-methods'
import type { ViewerDispatchInput } from '../../shared/plugins/viewer-contract'
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})
it('resolves data and dispatch from the bound workspace and rejects stale configuration', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'viewer-host-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'items.json'), JSON.stringify({ items: [{ id: 'a' }] }))
  const bindings = new ViewerBindingStore(join(dir, 'bindings.json'))
  const scope = { workspaceId: 'a', pluginKey: 'nowly.demo', panelId: 'list' }
  const binding = bindings.put({
    ...scope,
    schemaVersion: 1,
    workspaceRoot: dir,
    datasetRelativePath: 'items.json',
    automationId: 'automation',
    expectedOwner: { selector: { kind: 'self' } },
    projectName: 'A',
    automationName: 'Test'
  })
  const dispatch = vi.fn().mockResolvedValue({ runId: 'run', accepted: true, replayed: false })
  const host = new ViewerHostMethods({
    bindings,
    validate: async () => {},
    runner: { dispatch },
    runs: () => [],
    receipts: () => []
  })
  const context = { scope, bindingRevision: binding.revision }
  await expect(host.call('viewer.context', context, {})).resolves.toMatchObject({
    status: 'ready',
    projectName: 'A'
  })
  const page = await host.call('viewer.data', context, {})
  expect(page).toMatchObject({ items: [{ id: 'a' }] })
  const input: ViewerDispatchInput = {
    requestId: 'request',
    requestedAt: Date.now(),
    bindingRevision: binding.revision,
    datasetRevision: 'revision',
    selectedIds: ['a'],
    text: ''
  }
  await host.call('viewer.dispatch', context, input)
  expect(dispatch).toHaveBeenCalledWith(binding, input)
  await expect(
    host.call(
      'viewer.context',
      { scope: { ...scope, workspaceId: 'b' }, bindingRevision: null },
      {}
    )
  ).resolves.toEqual({ status: 'unconfigured' })
  bindings.put({ ...binding, automationId: 'other' })
  await expect(host.call('viewer.data', context, {})).rejects.toThrow('binding_changed')
})
it('returns pruned receipts only inside their original viewer scope', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'viewer-history-'))
  dirs.push(dir)
  const bindings = new ViewerBindingStore(join(dir, 'bindings.json'))
  const scope = { workspaceId: 'a', pluginKey: 'nowly.demo', panelId: 'list' }
  const binding = bindings.put({
    ...scope,
    schemaVersion: 1,
    workspaceRoot: dir,
    datasetRelativePath: 'items.json',
    automationId: 'automation',
    expectedOwner: { selector: { kind: 'self' } },
    projectName: 'A',
    automationName: 'Test'
  })
  const host = new ViewerHostMethods({
    bindings,
    validate: async () => {},
    runner: { dispatch: vi.fn() },
    runs: () => [],
    receipts: () => [
      {
        key: JSON.stringify([JSON.stringify(['a', 'nowly.demo', 'list']), 'request']),
        payloadHash: 'hash',
        runId: 'pruned',
        createdAt: Date.now()
      }
    ]
  })
  await expect(
    host.call('viewer.runs', { scope, bindingRevision: binding.revision }, { requestId: 'request' })
  ).resolves.toMatchObject({ runs: [{ runId: 'pruned', status: 'pruned' }] })
  await expect(
    host.call('viewer.runs', { scope, bindingRevision: binding.revision }, { requestId: 'unknown' })
  ).resolves.toMatchObject({ runs: [] })
})
