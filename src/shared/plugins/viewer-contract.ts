import { z } from 'zod'
import type { AutomationOwnerPrecondition } from '../automation-owner-precondition'

export const VIEWER_DATA_MAX_BYTES = 2 * 1024 * 1024
export const VIEWER_RESPONSE_MAX_BYTES = 32 * 1024
export const VIEWER_INPUT_MAX_BYTES = 32 * 1024
export const viewerScopeSchema = z
  .object({
    workspaceId: z.string().min(1).max(4096),
    pluginKey: z.string().min(1).max(256),
    panelId: z.string().min(1).max(256)
  })
  .strict()
export type ViewerCallContext = { scope: ViewerScope; bindingRevision: string | null }
export type ViewerScope = z.infer<typeof viewerScopeSchema>
export type ViewerBinding = ViewerScope & {
  schemaVersion: 1
  revision: string
  workspaceRoot: string
  datasetRelativePath: string
  automationId: string
  automationTargetKey?: string
  projectName: string
  automationName: string
  expectedOwner: AutomationOwnerPrecondition
}
export const viewerItemSchema = z
  .object({ id: z.string().min(1).max(128), title: z.string().optional() })
  .catchall(z.json())
export type ViewerItem = z.infer<typeof viewerItemSchema>
export const viewerDispatchInputSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    requestedAt: z.number().int().nonnegative(),
    bindingRevision: z.string().min(1),
    datasetRevision: z.string().min(1),
    selectedIds: z
      .array(z.string().min(1).max(128))
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
    text: z.string().max(8192)
  })
  .strict()
  .refine((input) => input.selectedIds.length > 0 || input.text.trim().length > 0)
export type ViewerDispatchInput = z.infer<typeof viewerDispatchInputSchema>
export const viewerPageParamsSchema = z
  .object({
    cursor: z.string().max(256).optional(),
    limit: z.number().int().min(1).max(100).optional()
  })
  .strict()
  .optional()
export const viewerDatasetPageSchema = z.object({
  items: z.array(viewerItemSchema),
  datasetRevision: z.string(),
  nextCursor: z.string().nullable()
})
export type ViewerDatasetPage = z.infer<typeof viewerDatasetPageSchema>
export const viewerContextResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    bindingRevision: z.string(),
    projectName: z.string(),
    automationName: z.string()
  }),
  z.object({ status: z.literal('unconfigured') }),
  z.object({ status: z.literal('unsupported') })
])
export type ViewerContextResult = z.infer<typeof viewerContextResultSchema>
export const viewerReceiptSchema = z.object({
  runId: z.string(),
  accepted: z.literal(true),
  replayed: z.boolean()
})
export type ViewerDispatchReceipt = z.infer<typeof viewerReceiptSchema>
export const viewerRunsParamsSchema = z
  .object({
    cursor: z.string().max(256).optional(),
    requestId: z.string().max(128).optional()
  })
  .strict()
  .optional()
export const viewerRunsResultSchema = z.object({
  runs: z.array(
    z.object({
      runId: z.string(),
      automationId: z.string().nullable(),
      status: z.string(),
      error: z.string().nullable(),
      output: z.string().nullable(),
      truncated: z.boolean()
    })
  ),
  nextCursor: z.string().nullable()
})
export type ViewerRunsResult = z.infer<typeof viewerRunsResultSchema>
export function viewerScopeKey(scope: ViewerScope): string {
  return JSON.stringify([scope.workspaceId, scope.pluginKey, scope.panelId])
}

export type ViewerSettings = {
  datasetRelativePath: string
  automationId: string
  automations: { id: string; name: string }[]
  configured: boolean
}
