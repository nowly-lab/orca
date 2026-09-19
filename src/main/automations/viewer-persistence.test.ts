import { viewerAutomationTargetKey } from './viewer-automation-target'
import { AutomationService } from './service'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { installFakeAppEnvironment } from '../../../config/scripts/vitest-host-ports-setup'
import { ViewerInputStore } from './viewer-input-store'
import { ViewerRunService } from './viewer-run-service'
import { readViewerDataset } from '../plugins/viewer-dataset'
import type { ViewerBinding } from '../../shared/plugins/viewer-contract'
import type { Store } from '../persistence'
const dirs: string[] = []
afterEach(() => {
  vi.useRealTimers()
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})
it('retains the receipt, provenance and immutable input after a real store reload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'viewer-persistence-'))
  dirs.push(dir)
  installFakeAppEnvironment({ getPath: () => dir })
  const persistence = await import('../persistence')
  persistence.initDataPath()
  const first = new persistence.Store()
  first.addRepo({ id: 'repo', path: dir, displayName: 'Fixture', badgeColor: '#fff', addedAt: 1 })
  const automation = first.createAutomation({
    name: 'Viewer fixture',
    prompt: 'Base prompt',
    agentId: 'codex',
    projectId: 'repo',
    workspaceMode: 'existing',
    workspaceId: 'workspace',
    reuseSession: true,
    enabled: false,
    timezone: 'UTC',
    rrule: 'FREQ=DAILY',
    dtstart: Date.now()
  })
  writeFileSync(join(dir, 'items.json'), JSON.stringify({ items: [{ id: 'a' }] }))
  const binding: ViewerBinding = {
    workspaceId: 'workspace',
    pluginKey: 'nowly.demo',
    panelId: 'list',
    revision: 'binding',
    schemaVersion: 1,
    workspaceRoot: dir,
    datasetRelativePath: 'items.json',
    automationId: automation.id,
    automationTargetKey: viewerAutomationTargetKey(automation),
    expectedOwner: { selector: { kind: 'self' } },
    projectName: 'Fixture',
    automationName: automation.name
  }
  const dispatch = vi.fn(async () => undefined)
  const inputs = new ViewerInputStore(join(dir, 'inputs'))
  const createRunner = (store: Store) =>
    new ViewerRunService({
      inputs,
      validate: async () => automation,
      receipts: () => store.listViewerInvocations(),
      runs: () => store.listAutomationRuns(),
      create: (a, input) => store.createViewerInvocation(a, input),
      dispatch,
      fail: () => {}
    })
  const input = {
    requestId: 'request',
    requestedAt: Date.now(),
    bindingRevision: 'binding',
    datasetRevision: (await readViewerDataset(binding)).revision,
    selectedIds: ['a'],
    text: 'hello'
  }
  const accepted = await createRunner(first).dispatch(binding, input)
  first.flushOrThrow()
  const second = new persistence.Store()
  const run = second.listAutomationRuns()[0]
  expect(run.id).toBe(accepted.runId)
  expect(run.viewer?.requestId).toBe('request')
  if (!run.viewer) {
    throw new Error('missing persisted input')
  }
  expect(inputs.read(run.viewer.input).text).toBe('hello')
  expect(await createRunner(second).dispatch(binding, input)).toMatchObject({
    runId: accepted.runId,
    replayed: true
  })
  expect(dispatch).toHaveBeenCalledTimes(1)
  // A crash after durable admission leaves pending input; recovery must close it without launching again.
  const observeCompletion = vi.fn(async () => ({ status: 'completed' as const }))
  const service = new AutomationService(second, {
    terminalObserver: { resolveRunTerminal: () => null, observeCompletion }
  })
  vi.useFakeTimers()
  service.start()
  service.setRendererReady()
  await vi.advanceTimersByTimeAsync(121000)
  service.stop()
  expect(second.listAutomationRuns()[0].status).toBe('dispatch_failed')
  expect(second.listAutomationRuns()[0].error).toContain('not automatically retried')
  expect(observeCompletion).not.toHaveBeenCalled()
  expect(await createRunner(second).dispatch(binding, input)).toMatchObject({
    runId: accepted.runId,
    replayed: true
  })
  expect(dispatch).toHaveBeenCalledTimes(1)
  const future = Date.now() + 86400001
  vi.setSystemTime(future)
  await createRunner(second).dispatch(binding, {
    ...input,
    requestId: 'future',
    requestedAt: future
  })
  second.flushOrThrow()
  const third = new persistence.Store()
  vi.setSystemTime(input.requestedAt)
  await expect(createRunner(third).dispatch(binding, input)).rejects.toThrow('request_expired')
  expect(dispatch).toHaveBeenCalledTimes(2)
})
