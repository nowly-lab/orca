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
  expect(a.getByRole('textbox')).toHaveProperty('readOnly', true)
  expect(screen.getByRole('button', { name: 'データを再読込' })).toHaveProperty('disabled', true)
  fireEvent.click(b.getByRole('button', { name: 'このタスクを実行' }))
  await waitFor(() => expect(b.getByRole('status').textContent).toContain('run-b'))
  fireEvent.click(a.getByRole('button', { name: '受付状況を確認' }))
  await waitFor(() => expect(a.getByRole('status').textContent).toContain('受付を確認できません'))
  expect(client.dispatch).toHaveBeenCalledTimes(2)
  fireEvent.click(a.getByRole('button', { name: '受付状況を確認' }))
  await waitFor(() => expect(send).toHaveProperty('disabled', false))
  expect(a.getByRole('textbox')).toHaveProperty('readOnly', false)
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

it('filters tasks without losing their instructions or hiding selected targets from bulk execution', async () => {
  const a = within(screen.getByRole('group', { name: 'Task A' }))
  fireEvent.input(a.getByRole('textbox'), { target: { value: 'Keep this draft' } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Task A' }))
  fireEvent.input(screen.getByRole('searchbox', { name: 'タスクを検索' }), {
    target: { value: 'task b' }
  })
  expect(screen.queryByRole('group', { name: 'Task A' })).toBeNull()
  expect(screen.getByRole('group', { name: 'Task B' })).toBeTruthy()
  const bulk = within(screen.getByRole('group', { name: '一括実行' }))
  expect(bulk.getByText('1件選択中')).toBeTruthy()
  expect(bulk.getByText('対象: Task A')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '検索をクリア' }))
  expect(within(screen.getByRole('group', { name: 'Task A' })).getByRole('textbox')).toHaveProperty(
    'value',
    'Keep this draft'
  )
  fireEvent.click(bulk.getByRole('button', { name: '選択を解除' }))
  expect(screen.getByRole('checkbox', { name: 'Task A' })).toHaveProperty('checked', false)
  expect(bulk.getByText('0件選択中')).toBeTruthy()
})

it('offers a search recovery action and distinguishes an empty dataset', async () => {
  fireEvent.input(screen.getByRole('searchbox', { name: 'タスクを検索' }), {
    target: { value: 'missing task' }
  })
  expect(screen.queryByRole('group', { name: 'Task A' })).toBeNull()
  expect(screen.getByText('一致するタスクがありません')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '検索をクリア' }))
  expect(screen.getByRole('group', { name: 'Task A' })).toBeTruthy()
  client.data.mockResolvedValueOnce({ items: [], datasetRevision: 'empty', nextCursor: null })
  fireEvent.click(screen.getByRole('button', { name: 'データを再読込' }))
  await screen.findByText('タスクがありません')
  expect(
    screen.getByText('接続したファイルにタスクを追加して、データを再読込してください。')
  ).toBeTruthy()
})
