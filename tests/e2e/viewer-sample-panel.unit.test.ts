// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from '@testing-library/dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const client = vi.hoisted(() => ({
  context: vi.fn(),
  data: vi.fn(),
  dispatch: vi.fn(),
  runs: vi.fn(),
  dispose: vi.fn()
}))
vi.mock('../../src/shared/plugins/viewer-panel-client', () => ({
  createViewerPanelClient: () => client
}))
beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  document.body.replaceChildren()
  client.context.mockResolvedValue({ status: 'ready', bindingRevision: 'binding' })
  client.data.mockResolvedValue({
    items: [
      { id: 'a', title: 'Task A' },
      { id: 'b', title: 'Task B' }
    ],
    datasetRevision: 'data',
    nextCursor: null
  })
  client.dispatch.mockImplementation(async (input) => ({
    runId: `run-${input.selectedIds.join('-')}`,
    accepted: true,
    replayed: false
  }))
  await import('../../examples/plugins/selection-viewer/panel')
  await screen.findByRole('checkbox', { name: 'Task A' })
})
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  document.body.replaceChildren()
})
it('dispatches each task with only its own instructions and keeps other drafts unchanged', async () => {
  const a = within(screen.getByRole('group', { name: 'Task A' }))
  const b = within(screen.getByRole('group', { name: 'Task B' }))
  fireEvent.input(a.getByRole('textbox'), { target: { value: 'Instructions A' } })
  fireEvent.input(b.getByRole('textbox'), { target: { value: 'Instructions B' } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Task B' }))
  fireEvent.input(screen.getByLabelText('追加の指示'), { target: { value: 'Bulk instructions' } })
  fireEvent.click(a.getByRole('button', { name: 'このタスクを実行' }))
  await waitFor(() => expect(a.getByRole('status').textContent).toContain('run-a'))
  expect(client.dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      selectedIds: ['a'],
      text: 'Instructions A',
      bindingRevision: 'binding',
      datasetRevision: 'data'
    })
  )
  expect(b.getByRole('textbox')).toHaveProperty('value', 'Instructions B')
  fireEvent.click(b.getByRole('button', { name: 'このタスクを実行' }))
  await waitFor(() => expect(b.getByRole('status').textContent).toContain('run-b'))
  expect(client.dispatch).toHaveBeenLastCalledWith(
    expect.objectContaining({ selectedIds: ['b'], text: 'Instructions B' })
  )
  expect(client.dispatch.mock.calls[0][0].requestId).not.toBe(
    client.dispatch.mock.calls[1][0].requestId
  )
})
it('fences an uncertain task against repeated sends while other tasks remain usable', async () => {
  client.dispatch.mockRejectedValueOnce(new Error('outcome_unknown'))
  client.runs
    .mockResolvedValueOnce({ runs: [] })
    .mockResolvedValueOnce({ runs: [{ runId: 'run-a', status: 'completed' }] })
  const a = within(screen.getByRole('group', { name: 'Task A' }))
  const b = within(screen.getByRole('group', { name: 'Task B' }))
  const send = a.getByRole('button', { name: 'このタスクを実行' })
  fireEvent.click(send)
  fireEvent.click(send)
  await waitFor(() => expect(a.getByRole('status').textContent).toContain('outcome_unknown'))
  expect(client.dispatch).toHaveBeenCalledTimes(1)
  expect(send).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: 'データを再読込' })).toHaveProperty('disabled', true)
  fireEvent.click(b.getByRole('button', { name: 'このタスクを実行' }))
  await waitFor(() => expect(b.getByRole('status').textContent).toContain('run-b'))
  fireEvent.click(a.getByRole('button', { name: '受付状況を確認' }))
  await waitFor(() => expect(a.getByRole('status').textContent).toContain('受付を確認できません'))
  expect(client.dispatch).toHaveBeenCalledTimes(2)
  fireEvent.click(a.getByRole('button', { name: '受付状況を確認' }))
  await waitFor(() => expect(send).toHaveProperty('disabled', false))
  expect(client.runs).toHaveBeenLastCalledWith(client.dispatch.mock.calls[0][0].requestId)
})
it('retains bulk execution with the checked tasks and bulk instructions', async () => {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Task A' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Task B' }))
  fireEvent.input(screen.getByLabelText('追加の指示'), { target: { value: 'Bulk instructions' } })
  fireEvent.click(screen.getByRole('button', { name: '実行' }))
  await waitFor(() =>
    expect(client.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ selectedIds: ['a', 'b'], text: 'Bulk instructions' })
    )
  )
})
