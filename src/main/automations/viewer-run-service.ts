import { createHash, randomUUID } from 'node:crypto'
import type { Automation, AutomationRun } from '../../shared/automations-types'
import {
  viewerDispatchInputSchema,
  viewerScopeKey,
  VIEWER_INPUT_MAX_BYTES,
  type ViewerBinding,
  type ViewerDispatchInput,
  type ViewerDispatchReceipt
} from '../../shared/plugins/viewer-contract'
import {
  composeViewerAutomationPrompt,
  type ViewerInvocationReceipt
} from '../../shared/viewer-automation-prompt'
import type { CreateViewerInvocation } from '../persistence/scheduling-automations/viewer-invocation-operations'
import { readViewerDataset, selectViewerItems } from '../plugins/viewer-dataset'
import type { ViewerInputStore } from './viewer-input-store'

export type ViewerRunDependencies = {
  inputs: ViewerInputStore
  validate(binding: ViewerBinding): Promise<Automation>
  receipts(): ViewerInvocationReceipt[]
  runs(): AutomationRun[]
  create(
    automation: Automation,
    input: CreateViewerInvocation
  ): { receipt: ViewerInvocationReceipt; replayed: boolean }
  dispatch(automation: Automation, run: AutomationRun, binding: ViewerBinding): Promise<unknown>
  fail(runId: string, error: string): void
}

export class ViewerRunService {
  private pending: Promise<unknown> = Promise.resolve()
  constructor(private readonly deps: ViewerRunDependencies) {}

  dispatch(binding: ViewerBinding, raw: ViewerDispatchInput): Promise<ViewerDispatchReceipt> {
    const input = viewerDispatchInputSchema.parse(raw)
    const request = this.pending.then(() => this.accept(binding, input))
    this.pending = request.catch(() => undefined)
    return request
  }

  private async accept(
    binding: ViewerBinding,
    input: ViewerDispatchInput
  ): Promise<ViewerDispatchReceipt> {
    const deps = this.deps
    await deps.validate(binding)
    if (binding.revision !== input.bindingRevision) {
      throw new Error('binding_changed')
    }
    const key = JSON.stringify([viewerScopeKey(binding), input.requestId])
    const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    const previous = deps.receipts().find((receipt) => receipt.key === key)
    if (previous) {
      if (previous.payloadHash !== payloadHash) {
        throw new Error('request_conflict')
      }
      return { runId: previous.runId, accepted: true, replayed: true }
    }
    if (Math.abs(Date.now() - input.requestedAt) > 300000) {
      throw new Error('request_expired')
    }
    const dataset = await readViewerDataset(binding)
    const selectedItems = selectViewerItems(dataset, input.datasetRevision, input.selectedIds)
    if (
      Buffer.byteLength(JSON.stringify({ selectedItems, text: input.text })) >
      VIEWER_INPUT_MAX_BYTES
    ) {
      throw new Error('input_too_large')
    }
    // Revalidate after file I/O, before the synchronous durable acceptance.
    const automation = await deps.validate(binding)
    const runId = randomUUID()
    const effectivePrompt = composeViewerAutomationPrompt(
      automation.prompt,
      selectedItems,
      input.text
    )
    const scope = {
      workspaceId: binding.workspaceId,
      pluginKey: binding.pluginKey,
      panelId: binding.panelId
    }
    const ref = deps.inputs.write(runId, {
      schemaVersion: 1,
      scope,
      bindingRevision: binding.revision,
      datasetRevision: dataset.revision,
      selectedItems,
      text: input.text,
      basePrompt: automation.prompt,
      effectivePrompt,
      requestId: input.requestId
    })
    const result = deps.create(automation, {
      key,
      payloadHash,
      requestedAt: input.requestedAt,
      runId,
      viewer: { scope, requestId: input.requestId, input: ref }
    })
    const run = deps.runs().find((entry) => entry.id === result.receipt.runId)
    if (!result.replayed && run) {
      try {
        await deps.dispatch(
          { ...automation, prompt: effectivePrompt, reuseSession: false },
          run,
          binding
        )
      } catch (error) {
        deps.fail(run.id, error instanceof Error ? error.message : String(error))
      }
    }
    // Serialized admissions ensure no in-flight snapshot is collected here.
    deps.inputs.prune(
      new Set([
        ...deps.runs().map((run) => run.id),
        ...deps.receipts().map((receipt) => receipt.runId)
      ])
    )
    return {
      runId: result.receipt.runId,
      accepted: true,
      replayed: result.replayed
    }
  }
}
