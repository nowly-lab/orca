// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ViewerBindingForm } from './ViewerBindingForm'
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
afterEach(cleanup)
it('keeps the binding scope fixed, shows save errors and reports a successful connection', async () => {
  const configureViewer = vi
    .fn()
    .mockRejectedValueOnce(new Error('invalid dataset'))
    .mockResolvedValueOnce({ configured: true })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { plugins: { configureViewer } }
  })
  const onSaved = vi.fn()
  const scope = { workspaceId: 'original', pluginKey: 'nowly.demo', panelId: 'list' }
  render(
    <ViewerBindingForm
      scope={scope}
      settings={{
        configured: false,
        datasetRelativePath: 'old.json',
        automationId: 'a',
        automations: [{ id: 'a', name: 'Example' }]
      }}
      onSaved={onSaved}
    />
  )
  fireEvent.change(screen.getByLabelText('Dataset file (relative to this workspace)'), {
    target: { value: 'new.json' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save connection' }))
  expect((await screen.findByRole('alert')).textContent).toBe('invalid dataset')
  expect(onSaved).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save connection' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  expect(configureViewer).toHaveBeenLastCalledWith({
    ...scope,
    datasetRelativePath: 'new.json',
    automationId: 'a'
  })
})
