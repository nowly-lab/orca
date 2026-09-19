// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { ViewerRunHistory, viewerRunStatusLabel } from './ViewerRunHistory'
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/store', () => ({ useAppStore: { getState: vi.fn() } }))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
it('polls visible runs, pauses hidden/unmounted panes, and labels completion without claiming success', async () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const panelAction = vi.fn().mockResolvedValue({
    ok: true,
    value: {
      runs: [
        {
          runId: 'a',
          automationId: 'a',
          status: 'completed',
          output: 'done',
          error: null,
          truncated: true
        }
      ],
      nextCursor: null
    }
  })
  Object.defineProperty(window, 'api', { configurable: true, value: { plugins: { panelAction } } })
  const view = render(<ViewerRunHistory sessionToken="session" isVisible />)
  await waitFor(() => expect(screen.getByText('Execution ended')).toBeTruthy())
  expect(screen.getByText('Output shortened. Open the run for details.')).toBeTruthy()
  expect(viewerRunStatusLabel('skipped_precheck')).toBe('Skipped')
  vi.useFakeTimers()
  view.rerender(<ViewerRunHistory sessionToken="session" isVisible={false} />)
  const count = panelAction.mock.calls.length
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000)
  })
  expect(panelAction).toHaveBeenCalledTimes(count)
  view.rerender(<ViewerRunHistory sessionToken="session" isVisible />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5001)
  })
  expect(panelAction.mock.calls.length).toBeGreaterThan(count + 1)
  view.unmount()
  const stopped = panelAction.mock.calls.length
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000)
  })
  expect(panelAction).toHaveBeenCalledTimes(stopped)
})

it('opens the original automation after the viewer has been rebound', async () => {
  const navigate = vi.fn()
  vi.mocked(useAppStore.getState).mockReturnValue(
    Object.assign({}, useAppStore.getState(), {
      setPendingAutomationRunNavigation: navigate,
      openAutomationsPage: vi.fn()
    })
  )
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      plugins: {
        panelAction: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            runs: [
              {
                runId: 'old-run',
                automationId: 'old-automation',
                status: 'completed',
                error: null,
                output: null,
                truncated: false
              }
            ],
            nextCursor: null
          }
        })
      }
    }
  })
  render(<ViewerRunHistory sessionToken="session" isVisible />)
  fireEvent.click(await screen.findByText('Execution ended'))
  expect(navigate).toHaveBeenCalledWith({
    automationId: 'old-automation',
    runId: 'old-run',
    hostId: 'local'
  })
})
