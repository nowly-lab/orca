import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ViewerBindingStore } from './viewer-binding-store'
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
it('persists workspace-scoped bindings and changes revision on edit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'viewer-bind-'))
  dirs.push(dir)
  const path = join(dir, 'bindings.json')
  const scope = {
    workspaceId: 'folder:a',
    pluginKey: 'local.demo',
    panelId: 'list'
  }
  const input = {
    ...scope,
    schemaVersion: 1 as const,
    workspaceRoot: dir,
    datasetRelativePath: 'data.json',
    automationId: 'a',
    automationTargetKey: 'target',
    projectName: 'P',
    automationName: 'A',
    expectedOwner: { selector: { kind: 'self' as const } }
  }
  const store = new ViewerBindingStore(path)
  const first = store.put(input)
  expect(new ViewerBindingStore(path).get(scope)).toEqual(first)
  expect(store.get({ ...scope, workspaceId: 'other' })).toBeNull()
  expect(store.put({ ...input, automationId: 'b' }).revision).not.toBe(first.revision)
})
