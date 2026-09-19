import { createViewerPanelClient } from '../../../src/shared/plugins/viewer-panel-client'
import { createExecutionControls } from './execution-controls'

const client = createViewerPanelClient(window)
const root = document.createElement('div')
root.className = 'viewer'
const list = document.createElement('div')
list.className = 'tasks'
const reload = document.createElement('button')
reload.textContent = 'データを再読込'
reload.type = 'button'
const message = document.createElement('p')
message.setAttribute('role', 'status')
const notice = document.createElement('p')
notice.textContent =
  '各タスクの指示欄に入力し、「このタスクを実行」を押すと、その1件だけを送信します。チェックは一括実行用です。'
let bindingRevision = ''
let datasetRevision = ''
let loading = false
const selected = new Set<string>()
const executions: ReturnType<typeof createExecutionControls>[] = []
const updateReload = () => {
  reload.disabled = loading || executions.some((action) => action.isUnsettled())
}
const bulk = createExecutionControls({
  client,
  label: '追加の指示',
  buttonLabel: '実行',
  input: () => ({ bindingRevision, datasetRevision, selectedIds: [...selected] }),
  onStateChange: updateReload
})
executions.push(bulk)
const bulkSection = document.createElement('section')
bulkSection.setAttribute('role', 'group')
bulkSection.setAttribute('aria-label', '一括実行')
const bulkHeading = document.createElement('h2')
bulkHeading.textContent = '選択したタスクをまとめて実行'
const resetNotice = document.createElement('p')
resetNotice.textContent =
  'プラグインの再読込・タブを閉じる操作で未送信の入力は消えます。選択しても元ファイルの完了状態は変わりません。'
bulkSection.append(bulkHeading, bulk.element)
root.append(notice, list, bulkSection, reload, message, resetNotice)
document.body.append(root)
const load = async () => {
  if (loading || executions.some((action) => action.isUnsettled())) {
    return
  }
  loading = true
  executions.forEach((action) => action.setAvailable(false))
  updateReload()
  message.textContent = ''
  try {
    const context = await client.context()
    if (context.status !== 'ready') {
      throw new Error('Viewer の接続設定が必要です')
    }
    const page = await client.data()
    bindingRevision = context.bindingRevision
    datasetRevision = page.datasetRevision
    selected.clear()
    list.replaceChildren()
    executions.splice(1)
    for (const item of page.items) {
      const title = item.title ?? item.id
      const row = document.createElement('section')
      row.className = 'task'
      row.setAttribute('role', 'group')
      row.setAttribute('aria-label', title)
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
      label.append(box, document.createTextNode(title))
      const action = createExecutionControls({
        client,
        label: `${title} への指示`,
        buttonLabel: 'このタスクを実行',
        input: () => ({ bindingRevision, datasetRevision, selectedIds: [item.id] }),
        onStateChange: updateReload
      })
      executions.push(action)
      row.append(label, action.element)
      list.append(row)
    }
    executions.forEach((action) => action.setAvailable(true))
    if (page.nextCursor) {
      message.textContent = '最初のページを表示しています。このサンプルは100件までのデータ用です。'
    }
  } catch (error) {
    message.textContent = String(error)
  } finally {
    loading = false
    updateReload()
  }
}
reload.addEventListener('click', () => {
  void load()
})
window.addEventListener('pagehide', () => client.dispose())
void load()
