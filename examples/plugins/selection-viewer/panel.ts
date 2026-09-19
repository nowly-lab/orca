import { createViewerPanelClient } from '../../../src/shared/plugins/viewer-panel-client'
import { createExecutionControls } from './execution-controls'

const client = createViewerPanelClient(window)
const root = document.createElement('main')
root.className = 'viewer'
const header = document.createElement('header')
header.className = 'viewer-header'
const heading = document.createElement('h1')
heading.textContent = 'タスクを実行'
const count = document.createElement('span')
count.className = 'count'
const introduction = document.createElement('p')
introduction.className = 'muted'
introduction.textContent = 'タスクに指示を添えて、接続した automation に送信します。'
const toolbar = document.createElement('div')
toolbar.className = 'toolbar'
const search = document.createElement('input')
search.type = 'search'
search.placeholder = 'タスクを検索…'
search.setAttribute('aria-label', 'タスクを検索')
const clearSearch = document.createElement('button')
clearSearch.type = 'button'
clearSearch.textContent = '検索をクリア'
clearSearch.hidden = true
const reload = document.createElement('button')
reload.textContent = 'データを再読込'
reload.type = 'button'
const titleLine = document.createElement('div')
titleLine.className = 'title-line'
titleLine.append(heading, count)
toolbar.append(search, clearSearch, reload)
header.append(titleLine, introduction, toolbar)
const list = document.createElement('div')
list.className = 'tasks'
const empty = document.createElement('div')
empty.className = 'empty-state'
empty.hidden = true
const emptyHeading = document.createElement('h2')
const emptyDescription = document.createElement('p')
empty.append(emptyHeading, emptyDescription)
const message = document.createElement('p')
message.className = 'page-message'
message.setAttribute('role', 'status')
let bindingRevision = ''
let datasetRevision = ''
let loading = false
let ready = false
const selected = new Set<string>()
const tasks: { id: string; title: string; row: HTMLElement; box: HTMLInputElement }[] = []
const executions: ReturnType<typeof createExecutionControls>[] = []
const updateReload = () => {
  reload.disabled = loading || executions.some((action) => action.isUnsettled())
}
const bulk = createExecutionControls({
  client,
  label: '追加の指示',
  fieldLabel: '共通の指示',
  buttonLabel: '実行',
  input: () => ({ bindingRevision, datasetRevision, selectedIds: [...selected] }),
  onStateChange: updateReload
})
executions.push(bulk)
const bulkSection = document.createElement('section')
bulkSection.className = 'bulk-section'
bulkSection.setAttribute('role', 'group')
bulkSection.setAttribute('aria-label', '一括実行')
const bulkDetails = document.createElement('details')
const bulkSummary = document.createElement('summary')
const bulkTitle = document.createElement('span')
bulkTitle.textContent = 'まとめて実行'
const selectionCount = document.createElement('span')
selectionCount.className = 'count'
bulkSummary.append(bulkTitle, selectionCount)
const bulkContent = document.createElement('div')
bulkContent.className = 'bulk-content'
const selectionLine = document.createElement('div')
selectionLine.className = 'selection-line'
const selectionTargets = document.createElement('p')
selectionTargets.className = 'muted'
const clearSelection = document.createElement('button')
clearSelection.type = 'button'
clearSelection.textContent = '選択を解除'
selectionLine.append(selectionTargets, clearSelection)
bulkContent.append(selectionLine, bulk.element)
bulkDetails.append(bulkSummary, bulkContent)
bulkSection.append(bulkDetails)
const help = document.createElement('details')
help.className = 'help muted'
const helpSummary = document.createElement('summary')
helpSummary.textContent = '使い方と注意点'
const helpText = document.createElement('p')
helpText.textContent =
  '個別実行にはチェック不要です。指示が空でも、タスクの内容だけを送れます。チェックは一括実行の選択用で、元ファイルの完了状態は変わりません。データやプラグインの再読込・タブを閉じる操作で入力は消えます。受付済みは実行完了を意味しません。進捗は下の実行履歴で確認できます。'
help.append(helpSummary, helpText)
root.append(header, message, list, empty, bulkSection, help)
document.body.append(root)

const updateSelection = () => {
  selectionCount.textContent = `${selected.size}件選択中`
  const titles = tasks.filter((task) => selected.has(task.id)).map((task) => task.title)
  selectionTargets.textContent = titles.length
    ? `対象: ${titles.join('、')}`
    : 'タスクにチェックを付けて選択。指示のみでも実行できます。'
  clearSelection.hidden = selected.size === 0
  for (const task of tasks) {
    task.box.checked = selected.has(task.id)
    task.row.dataset.selected = String(task.box.checked)
  }
}
const filterTasks = () => {
  const query = search.value.trim().toLocaleLowerCase()
  let visible = 0
  for (const task of tasks) {
    task.row.hidden = !task.title.toLocaleLowerCase().includes(query)
    if (!task.row.hidden) {
      visible++
    }
  }
  count.textContent = ready ? (query ? `${visible} / ${tasks.length}件` : `${tasks.length}件`) : ''
  clearSearch.hidden = !search.value
  empty.hidden = !ready || visible > 0
  emptyHeading.textContent = tasks.length ? '一致するタスクがありません' : 'タスクがありません'
  emptyDescription.textContent = tasks.length
    ? '別のキーワードで検索するか、検索をクリアしてください。'
    : '接続したファイルにタスクを追加して、データを再読込してください。'
}
const load = async () => {
  if (loading || executions.some((action) => action.isUnsettled())) {
    return
  }
  loading = true
  executions.forEach((action) => action.setAvailable(false))
  updateReload()
  root.setAttribute('aria-busy', 'true')
  message.textContent = 'タスクを読み込んでいます…'
  message.dataset.state = 'loading'
  try {
    const context = await client.context()
    if (context.status !== 'ready') {
      throw new Error('Viewer の接続設定が必要です')
    }
    const page = await client.data()
    bindingRevision = context.bindingRevision
    datasetRevision = page.datasetRevision
    selected.clear()
    tasks.splice(0)
    list.replaceChildren()
    executions.splice(1)
    for (const item of page.items) {
      const title = item.title ?? item.id
      const row = document.createElement('section')
      row.className = 'task'
      row.setAttribute('role', 'group')
      row.setAttribute('aria-label', title)
      const label = document.createElement('label')
      label.className = 'task-title'
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.addEventListener('change', () => {
        if (box.checked) {
          selected.add(item.id)
          bulkDetails.open = true
        } else {
          selected.delete(item.id)
        }
        updateSelection()
      })
      const titleText = document.createElement('span')
      titleText.textContent = title
      label.append(box, titleText)
      const action = createExecutionControls({
        client,
        label: `${title} への指示`,
        fieldLabel: 'このタスクへの指示',
        buttonLabel: 'このタスクを実行',
        input: () => ({ bindingRevision, datasetRevision, selectedIds: [item.id] }),
        onStateChange: updateReload
      })
      executions.push(action)
      tasks.push({ id: item.id, title, row, box })
      row.append(label, action.element)
      list.append(row)
    }
    ready = true
    executions.forEach((action) => action.setAvailable(true))
    updateSelection()
    filterTasks()
    message.textContent = page.nextCursor
      ? '先頭のページのみ表示しています。検索・一括実行の対象は表示済みのタスクです。'
      : ''
    message.dataset.state = 'notice'
  } catch (error) {
    message.dataset.state = 'error'
    message.textContent = `読み込めませんでした。${String(error)}。接続設定やファイルを確認して、再読込してください。`
  } finally {
    loading = false
    root.setAttribute('aria-busy', 'false')
    updateReload()
  }
}
search.addEventListener('input', filterTasks)
clearSearch.addEventListener('click', () => {
  search.value = ''
  filterTasks()
  search.focus()
})
clearSelection.addEventListener('click', () => {
  selected.clear()
  updateSelection()
})
reload.addEventListener('click', () => {
  void load()
})
window.addEventListener('pagehide', () => client.dispose())
updateSelection()
void load()
