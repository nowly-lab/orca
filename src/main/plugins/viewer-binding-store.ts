import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { writeSecureFile } from '../../shared/secure-file'
import {
  viewerScopeKey,
  viewerScopeSchema,
  type ViewerBinding,
  type ViewerScope
} from '../../shared/plugins/viewer-contract'

const bindingSchema = viewerScopeSchema.extend({
  schemaVersion: z.literal(1),
  revision: z.string(),
  workspaceRoot: z.string(),
  datasetRelativePath: z.string(),
  automationId: z.string(),
  automationTargetKey: z.string().optional(),
  projectName: z.string(),
  automationName: z.string(),
  expectedOwner: z.object({ selector: z.object({ kind: z.literal('self') }) })
})

export class ViewerBindingStore {
  constructor(private readonly storagePath: string) {}

  private read(): ViewerBinding[] {
    try {
      return z.array(bindingSchema).parse(JSON.parse(readFileSync(this.storagePath, 'utf8')))
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  get(scope: ViewerScope): ViewerBinding | null {
    return this.read().find((value) => viewerScopeKey(value) === viewerScopeKey(scope)) ?? null
  }

  put(value: Omit<ViewerBinding, 'revision'>): ViewerBinding {
    const next = bindingSchema.parse({ ...value, revision: randomUUID() })
    const bindings = this.read().filter((entry) => viewerScopeKey(entry) !== viewerScopeKey(value))
    if (bindings.length >= 1024) {
      throw new Error('viewer binding limit reached')
    }
    writeSecureFile(this.storagePath, JSON.stringify([...bindings, next]))
    return next
  }

  remove(scope: ViewerScope): void {
    writeSecureFile(
      this.storagePath,
      JSON.stringify(this.read().filter((entry) => viewerScopeKey(entry) !== viewerScopeKey(scope)))
    )
  }
}
