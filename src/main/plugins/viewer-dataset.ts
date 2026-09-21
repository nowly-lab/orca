import { createHash } from 'node:crypto'
import { open, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import {
  VIEWER_DATA_MAX_BYTES,
  VIEWER_RESPONSE_MAX_BYTES,
  viewerItemSchema,
  type ViewerItem,
  type ViewerDatasetPage
} from '../../shared/plugins/viewer-contract'

export type ViewerDataset = { revision: string; items: ViewerItem[] }
function assertContained(root: string, path: string): void {
  const rel = relative(root, path)
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) {
    throw new Error('dataset path is outside workspace')
  }
}
export async function readViewerDataset(binding: {
  workspaceRoot: string
  datasetRelativePath: string
}): Promise<ViewerDataset> {
  if (isAbsolute(binding.datasetRelativePath)) {
    throw new Error('dataset path is outside workspace')
  }
  const root = await realpath(binding.workspaceRoot)
  const requested = resolve(root, binding.datasetRelativePath)
  assertContained(root, requested)
  const path = await realpath(requested)
  assertContained(root, path)
  const initial = await stat(path)
  if (!initial.isFile() || initial.size > VIEWER_DATA_MAX_BYTES) {
    throw new Error('dataset_too_large')
  }
  const file = await open(path, 'r')
  try {
    const before = await file.stat()
    const currentPath = await realpath(requested)
    assertContained(root, currentPath)
    const current = await stat(currentPath)
    if (currentPath !== path || before.ino !== current.ino || before.dev !== current.dev) {
      throw new Error('data_changed')
    }
    if (!before.isFile() || before.size > VIEWER_DATA_MAX_BYTES) {
      throw new Error('dataset_too_large')
    }
    const bytes = Buffer.alloc(VIEWER_DATA_MAX_BYTES + 1)
    let length = 0
    while (length < bytes.length) {
      const read = await file.read(bytes, length, bytes.length - length, null)
      if (!read.bytesRead) {
        break
      }
      length += read.bytesRead
    }
    if (length > VIEWER_DATA_MAX_BYTES) {
      throw new Error('dataset_too_large')
    }
    const after = await file.stat()
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    ) {
      throw new Error('data_changed')
    }
    const finalPath = await realpath(requested)
    assertContained(root, finalPath)
    const finalStat = await stat(finalPath)
    if (finalPath !== path || finalStat.ino !== after.ino || finalStat.dev !== after.dev) {
      throw new Error('data_changed')
    }
    const content = bytes.subarray(0, length)
    const data = await parseDataset(content.toString('utf8'), binding.datasetRelativePath)
    if (new Set(data.items.map((item) => item.id)).size !== data.items.length) {
      throw new Error('duplicate item id')
    }
    return {
      revision: createHash('sha256').update(content).digest('hex'),
      items: data.items
    }
  } finally {
    await file.close()
  }
}
export function pageViewerDataset(
  dataset: ViewerDataset,
  cursor?: string,
  limit = 100
): ViewerDatasetPage {
  let offset = 0
  if (cursor) {
    const parts = cursor.split(':')
    if (parts.length !== 2 || parts[0] !== dataset.revision || !/^\d+$/.test(parts[1])) {
      throw new Error('data_changed')
    }
    offset = Number(parts[1])
    if (!Number.isSafeInteger(offset) || offset > dataset.items.length) {
      throw new Error('invalid_cursor')
    }
  }
  const items: ViewerItem[] = []
  const page = (): ViewerDatasetPage => ({
    items,
    datasetRevision: dataset.revision,
    nextCursor:
      offset + items.length < dataset.items.length
        ? `${dataset.revision}:${offset + items.length}`
        : null
  })
  for (const item of dataset.items.slice(offset, offset + Math.min(100, Math.max(1, limit)))) {
    items.push(item)
    if (Buffer.byteLength(JSON.stringify(page())) > VIEWER_RESPONSE_MAX_BYTES) {
      items.pop()
      if (!items.length) {
        throw new Error('row_too_large')
      }
      break
    }
  }
  return page()
}
export function selectViewerItems(
  dataset: ViewerDataset,
  expectedRevision: string,
  ids: string[]
): ViewerItem[] {
  if (dataset.revision !== expectedRevision) {
    throw new Error('data_changed')
  }
  const byId = new Map(dataset.items.map((item) => [item.id, item]))
  return ids.map((id) => {
    const item = byId.get(id)
    if (!item) {
      throw new Error('item_missing')
    }
    return item
  })
}

async function parseDataset(content: string, path: string): Promise<{ items: ViewerItem[] }> {
  const extension = extname(path).toLowerCase()
  let value: unknown
  if (extension === '.md' || extension === '.markdown') {
    const { readMarkdownViewerItems } = await import('./viewer-markdown-dataset')
    value = { items: readMarkdownViewerItems(content) }
  } else {
    try {
      value = JSON.parse(content)
    } catch {
      throw new Error('dataset_invalid_json')
    }
  }
  const result = z.object({ items: z.array(viewerItemSchema).max(10000) }).safeParse(value)
  if (!result.success) {
    throw new Error('dataset_invalid_shape')
  }
  return result.data
}
