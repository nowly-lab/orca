import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readViewerDataset, pageViewerDataset, selectViewerItems } from './viewer-dataset'
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})
it('reads bounded data, pages it and rejects stale selections', async () => {
  const root = await mkdtemp(join(tmpdir(), 'viewer-data-'))
  dirs.push(root)
  await writeFile(join(root, 'data.json'), JSON.stringify({ items: [{ id: 'a' }, { id: 'b' }] }))
  const data = await readViewerDataset({
    workspaceRoot: root,
    datasetRelativePath: 'data.json'
  })
  const first = pageViewerDataset(data, undefined, 1)
  expect(first.items).toEqual([{ id: 'a' }])
  expect(pageViewerDataset(data, first.nextCursor ?? undefined).items).toEqual([{ id: 'b' }])
  expect(selectViewerItems(data, data.revision, ['b', 'a'])).toEqual([{ id: 'b' }, { id: 'a' }])
  expect(() => selectViewerItems(data, 'old', ['a'])).toThrow('data_changed')
  expect(() => selectViewerItems(data, data.revision, ['missing'])).toThrow('item_missing')
})
it('refuses duplicate ids, oversized rows and paths outside the root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'viewer-data-'))
  dirs.push(root)
  const outside = await mkdtemp(join(tmpdir(), 'viewer-outside-'))
  dirs.push(outside)
  await writeFile(join(root, 'data.json'), JSON.stringify({ items: [{ id: 'a' }, { id: 'a' }] }))
  await expect(
    readViewerDataset({
      workspaceRoot: root,
      datasetRelativePath: 'data.json'
    })
  ).rejects.toThrow('duplicate')
  await writeFile(join(outside, 'secret.json'), '{"items":[]}')
  await symlink(join(outside, 'secret.json'), join(root, 'link.json'))
  await expect(
    readViewerDataset({
      workspaceRoot: root,
      datasetRelativePath: 'link.json'
    })
  ).rejects.toThrow('outside')
  await expect(
    readViewerDataset({
      workspaceRoot: root,
      datasetRelativePath: '../outside.json'
    })
  ).rejects.toThrow('outside')
  expect(() =>
    pageViewerDataset({
      revision: 'r',
      items: [{ id: 'a', text: 'x'.repeat(40000) }]
    })
  ).toThrow('row_too_large')
})
it('enforces file, row-count and cursor bounds, and changes revision when bytes change', async () => {
  const root = await mkdtemp(join(tmpdir(), 'viewer-limits-'))
  dirs.push(root)
  const binding = { workspaceRoot: root, datasetRelativePath: 'items.json' }
  const path = join(root, 'items.json')
  await writeFile(path, 'not JSON')
  await expect(readViewerDataset(binding)).rejects.toThrow()
  await writeFile(path, 'x'.repeat(2 * 1024 * 1024 + 1))
  await expect(readViewerDataset(binding)).rejects.toThrow('dataset_too_large')
  await writeFile(
    path,
    JSON.stringify({ items: Array.from({ length: 10001 }, (_, i) => ({ id: String(i) })) })
  )
  await expect(readViewerDataset(binding)).rejects.toThrow()
  await writeFile(path, JSON.stringify({ items: [{ id: 'a' }] }))
  const old = await readViewerDataset(binding)
  await writeFile(path, JSON.stringify({ items: [{ id: 'b' }] }))
  const current = await readViewerDataset(binding)
  expect(current.revision).not.toBe(old.revision)
  expect(() => pageViewerDataset(current, `${old.revision}:0`)).toThrow('data_changed')
})

it('reads Markdown tasks with their details, ignores fenced examples and preserves the source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'viewer-markdown-'))
  dirs.push(root)
  const source =
    '# 次やること\n\n- [ ] **確認する** [資料](https://example.com)\n    - task-id: task:1\n    - 補足の説明\n- [x] 済んだこと\n\n```md\n- [ ] サンプルのみ\n```\n'
  await writeFile(join(root, 'NEXT.md'), source)
  const binding = { workspaceRoot: root, datasetRelativePath: 'NEXT.md' }
  const data = await readViewerDataset(binding)
  expect(data.items).toHaveLength(2)
  expect(data.items[0]).toMatchObject({ title: '確認する 資料', checked: false })
  expect(data.items[0].markdown).toContain('task-id: task:1')
  expect(data.items[0].markdown).toContain('補足の説明')
  expect(data.items[1]).toMatchObject({ title: '済んだこと', checked: true })
  expect(selectViewerItems(data, data.revision, [data.items[0].id])).toEqual([data.items[0]])
  const reread = await readViewerDataset(binding)
  expect(reread).toEqual(data)
  expect(await readFile(join(root, 'NEXT.md'), 'utf8')).toBe(source)
  await writeFile(join(root, 'NEXT.md'), `# New heading\n\n${source}`)
  expect((await readViewerDataset(binding)).items.map((item) => item.id)).toEqual(
    data.items.map((item) => item.id)
  )
})

it('gives duplicate Markdown tasks distinct ids and rejects Markdown without checkboxes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'viewer-markdown-'))
  dirs.push(root)
  const binding = { workspaceRoot: root, datasetRelativePath: 'list.MD' }
  await writeFile(join(root, 'list.MD'), '- [ ] Same\n- [ ] Same\n')
  const data = await readViewerDataset(binding)
  expect(new Set(data.items.map((item) => item.id)).size).toBe(2)
  await writeFile(join(root, 'list.MD'), '# 私的な文書\n普通の本文\n')
  await expect(readViewerDataset(binding)).rejects.toThrow('dataset_markdown_no_tasks')
})

it('reports invalid JSON without exposing a fragment of the file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'viewer-json-errors-'))
  dirs.push(root)
  await writeFile(join(root, 'items.json'), '# 私的な文書')
  await expect(
    readViewerDataset({ workspaceRoot: root, datasetRelativePath: 'items.json' })
  ).rejects.toThrow(/^dataset_invalid_json$/)
  await writeFile(join(root, 'items.json'), '{"tasks":[]}')
  await expect(
    readViewerDataset({ workspaceRoot: root, datasetRelativePath: 'items.json' })
  ).rejects.toThrow(/^dataset_invalid_shape$/)
})
