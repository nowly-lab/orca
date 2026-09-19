import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { pluginPanelTabKey } from '../../../../shared/plugins/plugin-manifest'
import {
  viewerScopeSchema,
  type ViewerScope,
  type ViewerSettings
} from '../../../../shared/plugins/viewer-contract'
import PluginPanelFrame from '../plugin-panels/PluginPanelFrame'
import { ViewerBindingForm } from './ViewerBindingForm'
import { ViewerRunHistory } from './ViewerRunHistory'

function parseScope(entityId: string, workspaceId: string): ViewerScope | null {
  try {
    const scope = viewerScopeSchema.parse(JSON.parse(entityId))
    return scope.workspaceId === workspaceId ? scope : null
  } catch {
    return null
  }
}
export default function PluginViewerPane({
  entityId,
  workspaceId,
  isVisible
}: {
  entityId: string
  workspaceId: string
  isVisible: boolean
}) {
  const scope = useMemo(() => parseScope(entityId, workspaceId), [entityId, workspaceId])
  const [settings, setSettings] = useState<ViewerSettings | null>(null)
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => {
    if (!scope) {
      return
    }
    let disposed = false
    if (!window.api?.plugins?.viewerSettings) {
      setError(
        translate('viewer.localOnly', 'Custom viewers are available on the local desktop only.')
      )
      return
    }
    window.api.plugins
      .viewerSettings(scope)
      .then((value) => {
        if (!disposed) {
          setSettings(value)
          setError('')
        }
      })
      .catch((cause) => {
        if (!disposed) {
          setError(
            String(cause).includes('unsupported_viewer_host')
              ? translate(
                  'viewer.localOnly',
                  'Custom viewers are available on the local desktop only.'
                )
              : String(cause)
          )
        }
      })
    return () => {
      disposed = true
    }
  }, [scope, revision])
  if (!scope) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {translate('viewer.unavailable', 'This viewer is unavailable.')}
      </p>
    )
  }
  if (error) {
    return (
      <div className="p-4 text-sm">
        <p role="alert">{error}</p>
        <Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>
          {translate('viewer.retry', 'Retry')}
        </Button>
      </div>
    )
  }
  if (!settings) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {translate('viewer.loading', 'Loading viewer…')}
      </p>
    )
  }
  return (
    <div className="flex min-h-0 w-full flex-col bg-background text-foreground">
      <div className="flex items-center justify-between gap-2 border-b border-border p-2">
        <span className="text-xs text-muted-foreground">
          {settings.automations.find((entry) => entry.id === settings.automationId)?.name ??
            translate('viewer.configure', 'Connect a dataset and automation')}
        </span>
        <Button variant="outline" size="xs" onClick={() => setEditing((value) => !value)}>
          {translate('viewer.connection', 'Connection')}
        </Button>
      </div>
      {!settings.configured || editing ? (
        <ViewerBindingForm
          key={revision}
          scope={scope}
          settings={settings}
          onSaved={() => {
            setRevision((value) => value + 1)
            setEditing(false)
          }}
        />
      ) : null}
      {settings.configured && (
        <>
          <div className="flex min-h-0 flex-1">
            <PluginPanelFrame
              key={revision}
              tabKey={pluginPanelTabKey(scope.pluginKey, scope.panelId)}
              workspaceId={scope.workspaceId}
              onSession={setToken}
            />
          </div>
          <ViewerRunHistory sessionToken={token} isVisible={isVisible} />
        </>
      )}
    </div>
  )
}
