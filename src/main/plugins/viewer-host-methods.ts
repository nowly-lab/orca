import {
  viewerDispatchInputSchema,
  viewerPageParamsSchema,
  viewerRunsParamsSchema,
  viewerScopeKey,
  type ViewerBinding,
  type ViewerCallContext,
  type ViewerRunsResult
} from '../../shared/plugins/viewer-contract'
import type { AutomationRun } from '../../shared/automations-types'
import type { ViewerInvocationReceipt } from '../../shared/viewer-automation-prompt'
import { pageViewerDataset, readViewerDataset } from './viewer-dataset'
import type { ViewerBindingStore } from './viewer-binding-store'
import type { ViewerRunService } from '../automations/viewer-run-service'

export class ViewerHostMethods {
  constructor(
    private readonly deps: {
      bindings: ViewerBindingStore
      validate(binding: ViewerBinding): Promise<unknown>
      runner: Pick<ViewerRunService, 'dispatch'>
      runs(): AutomationRun[]
      receipts(): ViewerInvocationReceipt[]
    }
  ) {}

  async call(method: string, context: ViewerCallContext, params: unknown): Promise<unknown> {
    const binding = this.deps.bindings.get(context.scope)
    if ((binding?.revision ?? null) !== context.bindingRevision) {
      throw new Error('binding_changed')
    }
    if (!binding) {
      if (method === 'viewer.context') {
        return { status: 'unconfigured' }
      }
      throw new Error('viewer_not_configured')
    }
    await this.deps.validate(binding)
    switch (method) {
      case 'viewer.context':
        return {
          status: 'ready',
          bindingRevision: binding.revision,
          projectName: binding.projectName,
          automationName: binding.automationName
        }
      case 'viewer.data': {
        const query = viewerPageParamsSchema.parse(params)
        return pageViewerDataset(await readViewerDataset(binding), query?.cursor, query?.limit)
      }
      case 'viewer.dispatch':
        return this.deps.runner.dispatch(binding, viewerDispatchInputSchema.parse(params))
      case 'viewer.runs':
        return this.history(context, params)
      default:
        throw new Error('unknown viewer method')
    }
  }

  private history(context: ViewerCallContext, params: unknown): ViewerRunsResult {
    const query = viewerRunsParamsSchema.parse(params)
    const scopeKey = viewerScopeKey(context.scope)
    const runs = this.deps
      .runs()
      .filter(
        (run) =>
          run.viewer &&
          viewerScopeKey(run.viewer.scope) === scopeKey &&
          (!query?.requestId || run.viewer.requestId === query.requestId)
      )
    const offset = query?.cursor ? Number(query.cursor) : 0
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error('invalid_cursor')
    }
    const page = runs.slice(offset, offset + 10)
    const result: ViewerRunsResult = {
      runs: page.map((run) => {
        const output = run.outputSnapshot?.content ?? null
        return {
          runId: run.id,
          automationId: run.automationId,
          status: run.status,
          error: run.error?.slice(0, 256) ?? null,
          output: output?.slice(0, 256) ?? null,
          truncated:
            Boolean(output && output.length > 256) || Boolean(run.outputSnapshot?.truncated)
        }
      }),
      nextCursor: runs.length > offset + page.length ? String(offset + page.length) : null
    }
    if (query?.requestId && result.runs.length === 0) {
      const key = JSON.stringify([scopeKey, query.requestId])
      const receipt = this.deps.receipts().find((row) => row.key === key)
      if (receipt) {
        result.runs.push({
          runId: receipt.runId,
          automationId: null,
          status: 'pruned',
          error: null,
          output: null,
          truncated: false
        })
      }
    }
    return result
  }
}
