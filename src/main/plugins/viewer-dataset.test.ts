import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile, symlink } from 'node:fs/promises'
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
