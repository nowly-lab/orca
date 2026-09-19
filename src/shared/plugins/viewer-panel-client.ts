import { z } from 'zod'
import { PANEL_ACTION_REQUEST_TYPE, PANEL_ACTION_RESULT_TYPE } from './plugin-panel-bridge'
import {
  viewerContextResultSchema,
  viewerDatasetPageSchema,
  viewerReceiptSchema,
  viewerRunsResultSchema,
  type ViewerDispatchInput
} from './viewer-contract'

const responseSchema = z.object({
  type: z.literal(PANEL_ACTION_RESULT_TYPE),
  requestId: z.string(),
  ok: z.boolean(),
  value: z.unknown().optional(),
  error: z.string().optional()
})
export function createViewerPanelClient(frame: Window, timeoutMs = 15000) {
  let disposed = false
  let sequence = 0
  const prefix = Math.random().toString(36).slice(2)
  const pending = new Map<
    string,
    {
      resolve(value: unknown): void
      reject(error: Error): void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  const dispatches = new Map<string, { payload: string; promise: ReturnType<typeof dispatch> }>()
  const listener = (event: MessageEvent) => {
    if (event.source !== frame.parent) {
      return
    }
    const result = responseSchema.safeParse(event.data)
    if (!result.success) {
      return
    }
    const request = pending.get(result.data.requestId)
    if (!request) {
      return
    }
    pending.delete(result.data.requestId)
    clearTimeout(request.timer)
    if (result.data.ok) {
      request.resolve(result.data.value)
    } else {
      request.reject(new Error(result.data.error ?? 'viewer_request_failed'))
    }
  }
  frame.addEventListener('message', listener)
  const call = (action: string, params?: unknown): Promise<unknown> => {
    if (disposed) {
      return Promise.reject(new Error('viewer_disposed'))
    }
    const requestId = `${prefix}-${++sequence}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId)
        reject(new Error('outcome_unknown'))
      }, timeoutMs)
      pending.set(requestId, { resolve, reject, timer })
      frame.parent.postMessage({ type: PANEL_ACTION_REQUEST_TYPE, requestId, action, params }, '*')
    })
  }
  async function dispatch(input: ViewerDispatchInput) {
    return viewerReceiptSchema.parse(await call('viewer.dispatch', input))
  }
  return {
    context: async () => viewerContextResultSchema.parse(await call('viewer.context')),
    data: async (cursor?: string) =>
      viewerDatasetPageSchema.parse(await call('viewer.data', { cursor })),
    dispatch: (input: ViewerDispatchInput) => {
      const payload = JSON.stringify(input)
      const existing = dispatches.get(input.requestId)
      if (existing) {
        if (existing.payload !== payload) {
          return Promise.reject(new Error('request_conflict'))
        }
        return existing.promise
      }
      const promise = dispatch(input)
      dispatches.set(input.requestId, { payload, promise })
      return promise
    },
    runs: async (requestId?: string, cursor?: string) =>
      viewerRunsResultSchema.parse(await call('viewer.runs', { requestId, cursor })),
    dispose: () => {
      disposed = true
      frame.removeEventListener('message', listener)
      for (const request of pending.values()) {
        clearTimeout(request.timer)
        request.reject(new Error('viewer_disposed'))
      }
      pending.clear()
      dispatches.clear()
    }
  }
}
export type ViewerPanelClient = ReturnType<typeof createViewerPanelClient>
