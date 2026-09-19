import { pollVisibleViewerRuns } from './viewer-run-polling'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  viewerRunsResultSchema,
  type ViewerRunsResult
} from '../../../../shared/plugins/viewer-contract'

export function viewerRunStatusLabel(status: string): string {
  if (status === 'completed') {
    return translate('viewer.ended', 'Execution ended')
  }
  if (status === 'dispatch_failed') {
    return translate('viewer.failed', 'Failed to start')
  }
  if (status.startsWith('skipped_')) {
    return translate('viewer.skipped', 'Skipped')
  }
  if (status === 'dispatched') {
    return translate('viewer.started', 'Started')
  }
  if (status === 'pruned') {
    return translate('viewer.pruned', 'History no longer retained')
  }
  return translate('viewer.pending', 'Pending')
}
export function ViewerRunHistory({
  sessionToken,
  isVisible
}: {
  sessionToken: string | null
  isVisible: boolean
}) {
  const [result, setResult] = useState<ViewerRunsResult>({ runs: [], nextCursor: null })
  const [error, setError] = useState('')
  useEffect(() => {
    if (!sessionToken || !isVisible) {
      return
    }
    return pollVisibleViewerRuns(async (isCurrent) => {
      try {
        const response = await window.api.plugins.panelAction({
          sessionToken,
          action: 'viewer.runs'
        })
        if (!isCurrent()) {
          return
        }
        if (!response.ok) {
          throw new Error(response.error)
        }
        setResult(viewerRunsResultSchema.parse(response.value))
        setError('')
      } catch (cause) {
        if (isCurrent()) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      }
    })
  }, [sessionToken, isVisible])
  const open = (runId: string, automationId: string) => {
    const state = useAppStore.getState()
    state.setPendingAutomationRunNavigation({ automationId, runId, hostId: 'local' })
    state.openAutomationsPage()
  }
  return (
    <div className="max-h-48 overflow-auto scrollbar-sleek border-t border-border p-3 text-xs">
      <p className="text-muted-foreground">
        {translate(
          'viewer.history',
          'Recent runs — execution ending does not confirm task success.'
        )}
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {result.runs.map((run) => (
        <div key={run.runId} className="border-b border-border py-2">
          <Button
            variant="link"
            size="xs"
            disabled={!run.automationId}
            onClick={() => {
              if (run.automationId) {
                open(run.runId, run.automationId)
              }
            }}
          >
            {viewerRunStatusLabel(run.status)}
          </Button>
          {run.error && <p className="text-destructive">{run.error}</p>}
          {run.output && <p className="whitespace-pre-wrap break-words">{run.output}</p>}
          {run.truncated && (
            <p className="text-muted-foreground">
              {translate('viewer.truncated', 'Output shortened. Open the run for details.')}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
