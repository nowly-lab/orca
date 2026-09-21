import type { ViewerItem, ViewerScope } from './plugins/viewer-contract'

export type ViewerInputSnapshot = {
  schemaVersion: 1
  scope: ViewerScope
  bindingRevision: string
  datasetRevision: string
  selectedItems: ViewerItem[]
  text: string
  basePrompt: string
  effectivePrompt: string
  requestId: string
}
export type ViewerInputRef = { relativePath: string; sha256: string }
export type ViewerRunMetadata = {
  scope: ViewerScope
  requestId: string
  input: ViewerInputRef
}
export type ViewerInvocationReceipt = {
  key: string
  payloadHash: string
  runId: string
  createdAt: number
}
export function composeViewerAutomationPrompt(
  basePrompt: string,
  selectedItems: ViewerItem[],
  text: string
): string {
  return `${basePrompt}\n\nViewer input for this run (selected records and user instructions):\n${JSON.stringify({ selectedItems, text })}`
}
