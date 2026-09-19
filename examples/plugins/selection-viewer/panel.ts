import { createBrowserUuid } from '../../../src/renderer/src/lib/browser-uuid'
import { createViewerPanelClient } from '../../../src/shared/plugins/viewer-panel-client'
import type { ViewerDispatchInput, ViewerItem } from '../../../src/shared/plugins/viewer-contract'

const client = createViewerPanelClient(window)
const root = document.createElement('form')
const list = document.createElement('div')
const text = document.createElement('textarea')
text.placeholder = '追加の指示'
text.setAttribute('aria-label', '追加の指示')
text.maxLength = 8192
const send = document.createElement('button')
send.textContent = '実行'
send.type = 'button'
const reload = document.createElement('button')
reload.textContent = 'データを再読込'
reload.type = 'button'
const check = document.createElement('button')
check.textContent = '受付状況を確認'
check.type = 'button'
check.hidden = true
const message = document.createElement('p')
message.setAttribute('role', 'status')
const notice = document.createElement('p')
notice.textContent =
  '選択と入力は実行ボタンで送信します。プラグインの再読込・タブを閉じる操作で未送信の入力は消えます。'
root.append(notice, list, text, send, reload, check, message)
document.body.append(root)
let items: ViewerItem[] = []
let bindingRevision = ''
let datasetRevision = ''
let pending: ViewerDispatchInput | null = null
let busy = false
const selected = new Set<string>()
const load = async () => {
  if (busy || pending) {
    return
  }
  send.disabled = true
  message.textContent = ''
  try {
    const context = await client.context()
    if (context.status !== 'ready') {
      throw new Error('Viewer の接続設定が必要です')
    }
    bindingRevision = context.bindingRevision
    const page = await client.data()
    items = page.items
    datasetRevision = page.datasetRevision
    selected.clear()
    list.replaceChildren()
    for (const item of items) {
      const label = document.createElement('label')
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.addEventListener('change', () => {
        if (box.checked) {
          selected.add(item.id)
        } else {
          selected.delete(item.id)
        }
      })
      label.append(box, document.createTextNode(item.title ?? item.id))
      list.append(label)
    }
    if (page.nextCursor) {
      message.textContent = '最初のページを表示しています。このサンプルは100件までのデータ用です。'
    }
  } catch (error) {
    message.textContent = String(error)
  } finally {
    send.disabled = false
  }
}
send.addEventListener('click', async (event) => {
  event.preventDefault()
  if (busy || pending) {
    return
  }
  if (!selected.size && !text.value.trim()) {
    message.textContent = '項目を選ぶか、指示を入力してください'
    return
  }
  busy = true
  send.disabled = true
  reload.disabled = true
  pending = {
    requestId: createBrowserUuid(),
    requestedAt: Date.now(),
    bindingRevision,
    datasetRevision,
    selectedIds: [...selected],
    text: text.value
  }
  try {
    const receipt = await client.dispatch(pending)
    message.textContent = `受付済み: ${receipt.runId}`
    pending = null
  } catch (error) {
    message.textContent = `${String(error)}。受付状況を確認してください。`
    if (String(error).includes('automation_target_changed')) {
      pending = null
      message.textContent = '実行先が変更されました。接続設定を保存し直してください。'
    } else if (/data_changed|binding_changed|input_too_large|request_expired/.test(String(error))) {
      pending = null
      message.textContent = `${String(error)}。データを再読込してから再実行してください。`
    } else {
      check.hidden = false
    }
  } finally {
    busy = false
    send.disabled = Boolean(pending)
    reload.disabled = Boolean(pending)
  }
})
check.addEventListener('click', async () => {
  if (!pending || busy) {
    return
  }
  busy = true
  try {
    const result = await client.runs(pending.requestId)
    if (result.runs.length) {
      message.textContent = `受付済み: ${result.runs[0].runId} (${result.runs[0].status})`
      pending = null
      check.hidden = true
      send.disabled = false
      reload.disabled = false
    } else {
      message.textContent =
        '受付を確認できません。新しい実行は作成していません。接続やデータを確認してからタブを開き直してください。'
    }
  } catch (error) {
    message.textContent = String(error)
  } finally {
    busy = false
  }
})
reload.addEventListener('click', () => {
  void load()
})
window.addEventListener('pagehide', () => client.dispose())
void load()
