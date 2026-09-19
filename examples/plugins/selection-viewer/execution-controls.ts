import { createBrowserUuid } from '../../../src/renderer/src/lib/browser-uuid'
import type { createViewerPanelClient } from '../../../src/shared/plugins/viewer-panel-client'
import type { ViewerDispatchInput } from '../../../src/shared/plugins/viewer-contract'

type Input = Pick<ViewerDispatchInput, 'bindingRevision' | 'datasetRevision' | 'selectedIds'>
export function createExecutionControls(options: {
  client: ReturnType<typeof createViewerPanelClient>
  label: string
  fieldLabel: string
  buttonLabel: string
  input(): Input
  onStateChange(): void
}) {
  const element = document.createElement('div')
  element.className = 'execution-controls'
  const text = document.createElement('textarea')
  text.placeholder = '例：要点を整理して、次のアクションを提案'
  text.rows = 2
  text.className = 'scrollbar-sleek'
  text.setAttribute('aria-label', options.label)
  text.maxLength = 8192
  const label = document.createElement('label')
  label.className = 'instruction-label'
  const caption = document.createElement('span')
  caption.className = 'field-caption'
  caption.textContent = options.fieldLabel
  const optional = document.createElement('span')
  optional.className = 'optional'
  optional.textContent = '任意'
  caption.append(optional)
  label.append(caption, text)
  const send = document.createElement('button')
  send.type = 'button'
  send.textContent = options.buttonLabel
  send.className = 'button-primary'
  const check = document.createElement('button')
  check.type = 'button'
  check.textContent = '受付状況を確認'
  check.hidden = true
  const message = document.createElement('p')
  message.className = 'execution-message'
  message.setAttribute('role', 'status')
  const footer = document.createElement('div')
  footer.className = 'execution-footer'
  const buttons = document.createElement('div')
  buttons.className = 'execution-buttons'
  buttons.append(check, send)
  footer.append(message, buttons)
  element.append(label, footer)
  let available = false
  let busy = false
  let pending: ViewerDispatchInput | null = null
  const update = () => {
    send.disabled = !available || busy || Boolean(pending)
    text.disabled = !available
    text.readOnly = busy || Boolean(pending)
    send.setAttribute('aria-busy', String(busy))
    check.disabled = busy
    options.onStateChange()
  }
  send.addEventListener('click', async () => {
    if (!available || busy || pending) {
      return
    }
    const input = options.input()
    if (!input.selectedIds.length && !text.value.trim()) {
      message.dataset.state = 'error'
      message.textContent = '項目を選ぶか、指示を入力してください'
      return
    }
    busy = true
    check.hidden = true
    pending = {
      ...input,
      text: text.value,
      requestId: createBrowserUuid(),
      requestedAt: Date.now()
    }
    message.textContent = '送信中…'
    message.dataset.state = 'pending'
    update()
    try {
      const receipt = await options.client.dispatch(pending)
      message.textContent = `受付済み: ${receipt.runId}`
      message.dataset.state = 'accepted'
      pending = null
    } catch (error) {
      message.dataset.state = 'error'
      message.textContent = `${String(error)}。受付状況を確認してください。`
      if (String(error).includes('automation_target_changed')) {
        pending = null
        message.textContent = '実行先が変更されました。接続設定を保存し直してください。'
      } else if (
        /data_changed|binding_changed|input_too_large|request_expired/.test(String(error))
      ) {
        pending = null
        message.textContent = `${String(error)}。データを再読込してから再実行してください。`
      } else {
        check.hidden = false
      }
    } finally {
      busy = false
      update()
    }
  })
  check.addEventListener('click', async () => {
    if (!pending || busy) {
      return
    }
    busy = true
    update()
    try {
      const result = await options.client.runs(pending.requestId)
      if (result.runs.length) {
        message.textContent = `受付済み: ${result.runs[0].runId} (${result.runs[0].status})`
        message.dataset.state = 'accepted'
        pending = null
        check.hidden = true
      } else {
        message.textContent =
          '受付を確認できません。新しい実行は作成していません。接続やデータを確認してからタブを開き直してください。'
      }
    } catch (error) {
      message.textContent = String(error)
    } finally {
      busy = false
      update()
    }
  })
  send.disabled = true
  return {
    element,
    isUnsettled: () => busy || Boolean(pending),
    setAvailable(value: boolean) {
      available = value
      update()
    }
  }
}
