import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import { translate } from '@/i18n/i18n'
import type { ViewerScope, ViewerSettings } from '../../../../shared/plugins/viewer-contract'

export function ViewerBindingForm({
  scope,
  settings,
  onSaved
}: {
  scope: ViewerScope
  settings: ViewerSettings
  onSaved(): void
}) {
  const id = useId()
  const [path, setPath] = useState(settings.datasetRelativePath)
  const [automationId, setAutomationId] = useState(settings.automationId)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await window.api.plugins.configureViewer({
        ...scope,
        datasetRelativePath: path,
        automationId
      })
      onSaved()
    } catch (cause) {
      setError(viewerDatasetError(cause))
    } finally {
      setSaving(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!saving) {
          void save()
        }
      }}
    >
      <Label htmlFor={`${id}-path`}>
        {translate('viewer.dataset', 'Dataset file (relative to this workspace)')}
      </Label>
      <Input
        id={`${id}-path`}
        value={path}
        onChange={(event) => setPath(event.target.value)}
        aria-describedby={`${id}-format`}
        placeholder="NEXT.md / data/items.json"
        required
      />
      <p id={`${id}-format`} className="text-xs text-muted-foreground">
        {translate(
          'viewer.formatHint',
          'Choose a Markdown checklist (.md) or a Viewer JSON file. Selections do not change the original file.'
        )}
      </p>
      <Label htmlFor={`${id}-automation`}>{translate('viewer.automation', 'Automation')}</Label>
      <Select value={automationId} onValueChange={setAutomationId}>
        <SelectTrigger id={`${id}-automation`}>
          <SelectValue placeholder={translate('viewer.chooseAutomation', 'Choose an automation')} />
        </SelectTrigger>
        <SelectContent>
          {settings.automations.map((automation) => (
            <SelectItem key={automation.id} value={automation.id}>
              {automation.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {settings.automations.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {translate('viewer.noAutomations', 'Create a local automation in this project first.')}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {translate(
          'viewer.replaceNotice',
          'Saving a connection or reloading the plugin clears unsent form input.'
        )}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" size="sm" disabled={saving || !path.trim() || !automationId}>
          {translate('viewer.save', 'Save connection')}
        </Button>
      </div>
    </form>
  )
}

function viewerDatasetError(cause: unknown): string {
  const message = readIpcErrorMessage(cause) ?? String(cause)
  switch (message) {
    case 'dataset_markdown_no_tasks':
      return translate(
        'viewer.noMarkdownTasks',
        'No checklist items found. Choose Markdown containing - [ ] task items.'
      )
    case 'dataset_invalid_json':
      return translate(
        'viewer.invalidJson',
        'This file is not valid JSON. For a Markdown checklist, choose a .md file.'
      )
    case 'dataset_invalid_shape':
      return translate(
        'viewer.invalidShape',
        'Use a dataset with at most 10,000 items, each with a nonempty id of at most 128 characters. JSON must contain an items list.'
      )
    default:
      return message
  }
}
