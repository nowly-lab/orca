import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { writeSecureFile } from '../../shared/secure-file'
import { viewerItemSchema, viewerScopeSchema } from '../../shared/plugins/viewer-contract'
import type { ViewerInputRef, ViewerInputSnapshot } from '../../shared/viewer-automation-prompt'
const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  scope: viewerScopeSchema,
  bindingRevision: z.string(),
  datasetRevision: z.string(),
  selectedItems: z.array(viewerItemSchema),
  text: z.string(),
  basePrompt: z.string(),
  effectivePrompt: z.string(),
  requestId: z.string()
})
export class ViewerInputStore {
  constructor(private readonly directory: string) {}
  private path(name: string): string {
    if (!/^[a-zA-Z0-9-]+\.json$/.test(name)) {
      throw new Error('invalid_input_path')
    }
    return join(this.directory, name)
  }
  write(runId: string, snapshot: ViewerInputSnapshot): ViewerInputRef {
    const relativePath = `${runId}.json`
    const content = JSON.stringify(snapshotSchema.parse(snapshot))
    writeSecureFile(this.path(relativePath), content)
    return {
      relativePath,
      sha256: createHash('sha256').update(content).digest('hex')
    }
  }
  read(ref: ViewerInputRef): ViewerInputSnapshot {
    const content = readFileSync(this.path(ref.relativePath), 'utf8')
    if (createHash('sha256').update(content).digest('hex') !== ref.sha256) {
      throw new Error('input_changed')
    }
    return snapshotSchema.parse(JSON.parse(content))
  }
  prune(retainedRunIds: Set<string>): void {
    let entries: string[]
    try {
      entries = readdirSync(this.directory)
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return
      }
      throw error
    }
    for (const name of entries) {
      if (/^[a-zA-Z0-9-]+\.json$/.test(name) && !retainedRunIds.has(name.slice(0, -5))) {
        unlinkSync(this.path(name))
      }
    }
  }
}
