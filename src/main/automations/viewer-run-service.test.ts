import { viewerAutomationTargetKey } from './viewer-automation-target'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDefaultPersistedState } from '../../shared/constants'
import type { Automation } from '../../shared/automations-types'
import type { ViewerBinding } from '../../shared/plugins/viewer-contract'
import { createViewerInvocation } from '../persistence/scheduling-automations/viewer-invocation-operations'
import { createAutomationRun } from '../persistence/scheduling-automations/automation-run-operations'
import { ViewerInputStore } from './viewer-input-store'
import { ViewerRunService } from './viewer-run-service'
import { readViewerDataset } from '../plugins/viewer-dataset'

const dirs: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'viewer-runs-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'items.json'), JSON.stringify({ items: [{ id: 'a', title: 'A' }] }))
  const state = getDefaultPersistedState(dir)
  const automation: Automation = {
    id: 'automation',
    name: 'Test',
    prompt: 'Review',
    precheck: null,
    agentId: 'codex',
    projectId: 'repo',
    executionTargetType: 'local',
    executionTargetId: 'local',
    schedulerOwner: 'local_host_service',
    workspaceMode: 'existing',
    workspaceId: 'workspace',
    baseBranch: null,
    reuseSession: true,
    timezone: 'UTC',
    rrule: 'FREQ=DAILY',
    dtstart: 1,
    enabled: false,
    nextRunAt: 0,
    missedRunPolicy: 'run_once_within_grace',
    missedRunGraceMinutes: 15,
    createdAt: 1,
    updatedAt: 1
  }
  state.automations = [automation]
  const binding: ViewerBinding = {
    schemaVersion: 1,
    revision: 'binding',
    workspaceId: 'workspace',
    pluginKey: 'test/viewer',
    panelId: 'select',
    workspaceRoot: dir,
    datasetRelativePath: 'items.json',
    automationId: automation.id,
    automationTargetKey: viewerAutomationTargetKey(automation),
    expectedOwner: { selector: { kind: 'self' } },
    projectName: 'Test',
    automationName: 'Test'
  }
  const dispatch = vi.fn(async (_automation: Automation) => undefined)
  const validate = vi.fn(async () => automation)
  const flush = vi.fn(() => writeFileSync(join(dir, 'state.json'), JSON.stringify(state)))
  const inputs = new ViewerInputStore(join(dir, 'inputs'))
  const deps = {
    inputs,
    validate,
    receipts: () => state.viewerInvocations ?? [],
    runs: () => state.automationRuns,
    create: (a: Automation, input: Parameters<typeof createViewerInvocation>[2]) =>
      createViewerInvocation(
        { state, flush, recordManualRun: () => {}, getWorkspaceDisplayName: () => null },
        a,
        input
      ),
    dispatch,
    fail: vi.fn()
  }
  const input = {
    requestId: 'request',
    requestedAt: Date.now(),
    bindingRevision: binding.revision,
    datasetRevision: (await readViewerDataset(binding)).revision,
    selectedIds: ['a'],
    text: 'line\n$(echo data)'
  }
  return {
    dir,
    state,
    automation,
    binding,
    input,
    inputs,
    deps,
    dispatch,
    validate,
    flush,
    runner: new ViewerRunService(deps)
  }
}
describe('durable viewer admission', () => {
  it('deduplicates concurrent requests and preserves a fresh-session snapshot without editing the definition', async () => {
    const f = await fixture()
    const before = structuredClone(f.automation)
    const [one, two] = await Promise.all([
      f.runner.dispatch(f.binding, f.input),
      f.runner.dispatch(f.binding, f.input)
    ])
    expect(one.runId).toBe(two.runId)
    expect(two.replayed).toBe(true)
    expect(f.dispatch).toHaveBeenCalledTimes(1)
    expect(f.state.automationRuns).toHaveLength(1)
    expect(f.state.automations[0]).toEqual(before)
    const run = f.state.automationRuns[0]
    expect(run.viewer).toBeDefined()
    if (!run.viewer) {
      throw new Error('missing metadata')
    }
    const snapshot = f.inputs.read(run.viewer.input)
    expect(snapshot.text).toBe(f.input.text)
    expect(snapshot.selectedItems).toEqual([{ id: 'a', title: 'A' }])
    expect(f.dispatch.mock.calls[0]?.[0]).toMatchObject({
      prompt: snapshot.effectivePrompt,
      reuseSession: false
    })
    expect(
      JSON.parse(readFileSync(join(f.dir, 'state.json'), 'utf8')).viewerInvocations[0].runId
    ).toBe(one.runId)
  })
  it('replays after recreation and history pruning, even with an old requestedAt', async () => {
    const f = await fixture()
    const accepted = await f.runner.dispatch(f.binding, f.input)
    f.state.automationRuns = []
    vi.spyOn(Date, 'now').mockReturnValue(f.input.requestedAt + 600000)
    const restarted = new ViewerRunService(f.deps)
    expect(await restarted.dispatch(f.binding, f.input)).toMatchObject({
      runId: accepted.runId,
      replayed: true
    })
    await expect(restarted.dispatch(f.binding, { ...f.input, text: 'changed' })).rejects.toThrow(
      'request_conflict'
    )
    expect(f.dispatch).toHaveBeenCalledTimes(1)
  })
  it('keeps distinct requests distinct in the same millisecond', async () => {
    const f = await fixture()
    vi.spyOn(Date, 'now').mockReturnValue(f.input.requestedAt)
    const one = await f.runner.dispatch(f.binding, f.input)
    const two = await f.runner.dispatch(f.binding, { ...f.input, requestId: 'two' })
    expect(one.runId).not.toBe(two.runId)
    expect(f.dispatch).toHaveBeenCalledTimes(2)
  })
  it('rejects expired, future, stale-data and owner-fenced requests before acceptance', async () => {
    const f = await fixture()
    for (const requestedAt of [1, Date.now() + 600000]) {
      await expect(f.runner.dispatch(f.binding, { ...f.input, requestedAt })).rejects.toThrow(
        'request_expired'
      )
    }
    await expect(
      f.runner.dispatch(f.binding, { ...f.input, datasetRevision: 'old' })
    ).rejects.toThrow('data_changed')
    f.validate.mockRejectedValue(new Error('owner_changed'))
    await expect(f.runner.dispatch(f.binding, f.input)).rejects.toThrow('owner_changed')
    expect(f.state.automationRuns).toEqual([])
    expect(f.dispatch).not.toHaveBeenCalled()
  })
  it('rolls back receipt and run on durable write failure and never dispatches', async () => {
    const f = await fixture()
    f.flush.mockImplementation(() => {
      throw new Error('disk full')
    })
    await expect(f.runner.dispatch(f.binding, f.input)).rejects.toThrow('disk full')
    expect(f.state.automationRuns).toEqual([])
    expect(f.state.viewerInvocations).toEqual([])
    expect(f.dispatch).not.toHaveBeenCalled()
  })
  it('does not dispatch when the snapshot cannot be saved', async () => {
    const f = await fixture()
    vi.spyOn(f.inputs, 'write').mockImplementation(() => {
      throw new Error('snapshot failed')
    })
    await expect(f.runner.dispatch(f.binding, f.input)).rejects.toThrow('snapshot failed')
    expect(f.flush).not.toHaveBeenCalled()
    expect(f.dispatch).not.toHaveBeenCalled()
  })
})

it('does not reuse a viewer run for a scheduled tick at the same millisecond', async () => {
  const f = await fixture()
  vi.spyOn(Date, 'now').mockReturnValue(f.input.requestedAt)
  const accepted = await f.runner.dispatch(f.binding, f.input)
  const scheduled = createAutomationRun(
    {
      state: f.state,
      flush: f.flush,
      recordManualRun: () => {},
      getWorkspaceDisplayName: () => null
    },
    f.automation,
    f.input.requestedAt
  )
  expect(scheduled.id).not.toBe(accepted.runId)
  expect(scheduled.trigger).toBe('scheduled')
  expect(scheduled.viewer).toBeUndefined()
})

it('retains active receipts beyond 24 hours but rejects an expired identity after its receipt is collected', async () => {
  const f = await fixture()
  const first = await f.runner.dispatch(f.binding, f.input)
  const later = (f.state.viewerInvocations?.[0]?.createdAt ?? f.input.requestedAt) + 86400001
  vi.spyOn(Date, 'now').mockReturnValue(later)
  await f.runner.dispatch(f.binding, { ...f.input, requestId: 'second', requestedAt: later })
  expect(f.state.viewerInvocations?.some((row) => row.runId === first.runId)).toBe(true)
  f.state.automationRuns = f.state.automationRuns.map((run) => ({ ...run, status: 'completed' }))
  await f.runner.dispatch(f.binding, { ...f.input, requestId: 'third', requestedAt: later })
  expect(f.state.viewerInvocations?.some((row) => row.runId === first.runId)).toBe(false)
  await expect(f.runner.dispatch(f.binding, f.input)).rejects.toThrow('request_expired')
  expect(f.dispatch).toHaveBeenCalledTimes(3)
})

it('requires rebinding when the automation execution workspace changes', async () => {
  const f = await fixture()
  for (const change of [
    { workspaceId: 'another-workspace' },
    { projectId: 'another-repo' },
    { workspaceMode: 'new_per_run' as const, workspaceId: null }
  ]) {
    f.validate.mockResolvedValue({ ...f.automation, ...change })
    await expect(f.runner.dispatch(f.binding, f.input)).rejects.toThrow('automation_target_changed')
  }
  expect(f.dispatch).not.toHaveBeenCalled()
  expect(f.state.automationRuns).toEqual([])
})
it('never revives a collected receipt after a forward clock jump and correction', async () => {
  const f = await fixture()
  await f.runner.dispatch(f.binding, f.input)
  f.state.automationRuns = f.state.automationRuns.map((run) => ({ ...run, status: 'completed' }))
  const future = (f.state.viewerInvocations?.[0]?.createdAt ?? f.input.requestedAt) + 86400001
  const clock = vi.spyOn(Date, 'now').mockReturnValue(future)
  await f.runner.dispatch(f.binding, { ...f.input, requestId: 'future', requestedAt: future })
  expect(f.state.viewerInvocations?.some((row) => row.key.includes('"request"'))).toBe(false)
  f.state.automationRuns = []
  clock.mockReturnValue(f.input.requestedAt)
  await expect(new ViewerRunService(f.deps).dispatch(f.binding, f.input)).rejects.toThrow(
    'request_expired'
  )
  expect(f.dispatch).toHaveBeenCalledTimes(2)
})

it('permits prompt and schedule edits that preserve the connected execution target', async () => {
  const f = await fixture()
  f.validate.mockResolvedValue({
    ...f.automation,
    prompt: 'Edited instructions',
    rrule: 'FREQ=WEEKLY'
  })
  await f.runner.dispatch(f.binding, f.input)
  expect(f.dispatch.mock.calls[0][0].prompt).toContain('Edited instructions')
})
