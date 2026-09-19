// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createViewerPanelClient } from './viewer-panel-client'
import { PANEL_ACTION_RESULT_TYPE } from './plugin-panel-bridge'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
it('correlates parallel requests, ignores foreign senders and deduplicates dispatch clicks', async () => {
  const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {})
  const client = createViewerPanelClient(window)
  const context = client.context()
  const data = client.data()
  const first = post.mock.calls[0][0]
  const second = post.mock.calls[1][0]
  const reply = (requestId: string, value: unknown, source: Window | null = window.parent) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source,
        data: { type: PANEL_ACTION_RESULT_TYPE, requestId, ok: true, value }
      })
    )
  reply(first.requestId, { status: 'unsupported' }, null)
  reply(second.requestId, { items: [], datasetRevision: 'v1', nextCursor: null })
  reply(first.requestId, {
    status: 'ready',
    bindingRevision: 'b',
    projectName: 'P',
    automationName: 'A'
  })
  expect(await context).toMatchObject({ status: 'ready' })
  expect((await data).datasetRevision).toBe('v1')
  const input = {
    requestId: 'durable-key',
    requestedAt: 1,
    bindingRevision: 'b',
    datasetRevision: 'v1',
    selectedIds: ['a'],
    text: ''
  }
  const one = client.dispatch(input)
  const two = client.dispatch(input)
  expect(post).toHaveBeenCalledTimes(3)
  expect(one).toBe(two)
  reply(post.mock.calls[2][0].requestId, { runId: 'run', accepted: true, replayed: false })
  expect(await one).toMatchObject({ runId: 'run' })
  client.dispose()
})
it('keeps unknown dispatch identity and rejects outstanding requests on disposal', async () => {
  vi.useFakeTimers()
  const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {})
  const client = createViewerPanelClient(window, 10)
  const input = {
    requestId: 'durable',
    requestedAt: 1,
    bindingRevision: 'b',
    datasetRevision: 'v',
    selectedIds: ['a'],
    text: ''
  }
  const request = client.dispatch(input)
  const outcome = expect(request).rejects.toThrow('outcome_unknown')
  await vi.advanceTimersByTimeAsync(11)
  await outcome
  await expect(client.dispatch(input)).rejects.toThrow('outcome_unknown')
  expect(post).toHaveBeenCalledTimes(1)
  const pending = client.data()
  const disposed = expect(pending).rejects.toThrow('viewer_disposed')
  client.dispose()
  await disposed
})
