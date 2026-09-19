import type { Automation } from '../../../shared/automations-types'
import { isFinalAutomationRunStatus } from '../../../shared/automations-types'
import type {
  ViewerInvocationReceipt,
  ViewerRunMetadata
} from '../../../shared/viewer-automation-prompt'
import { createAutomationRun, type AutomationRunOperations } from './automation-run-operations'

export type CreateViewerInvocation = {
  key: string
  payloadHash: string
  requestedAt: number
  runId: string
  viewer: ViewerRunMetadata
}
export function createViewerInvocation(
  operations: AutomationRunOperations,
  automation: Automation,
  input: CreateViewerInvocation,
  now = Date.now()
): { receipt: ViewerInvocationReceipt; replayed: boolean } {
  const receipts = operations.state.viewerInvocations ?? []
  const previous = receipts.find((receipt) => receipt.key === input.key)
  if (previous) {
    if (previous.payloadHash !== input.payloadHash) {
      throw new Error('request_conflict')
    }
    return { receipt: previous, replayed: true }
  }
  const oldExpiredBefore = operations.state.viewerInvocationExpiredBefore
  if (
    input.requestedAt <= (oldExpiredBefore ?? -1) ||
    Math.abs(now - input.requestedAt) > 5 * 60 * 1000
  ) {
    throw new Error('request_expired')
  }
  const oldRuns = operations.state.automationRuns
  const oldAutomations = operations.state.automations
  const retained = receipts.filter(
    (receipt) =>
      now - receipt.createdAt < 86400000 ||
      oldRuns.some((run) => run.id === receipt.runId && !isFinalAutomationRunStatus(run.status))
  )
  const retainedKeys = new Set(retained.map((receipt) => receipt.key))
  // A receipt could have been requested up to five minutes ahead of admission.
  // Never accept timestamps covered by a collected receipt after a clock rollback.
  const expiredBefore = receipts.reduce(
    (floor, receipt) =>
      retainedKeys.has(receipt.key) ? floor : Math.max(floor, receipt.createdAt + 300000),
    oldExpiredBefore ?? -1
  )
  if (input.requestedAt <= expiredBefore) {
    throw new Error('request_expired')
  }
  if (retained.length >= 10000) {
    throw new Error('viewer request capacity reached')
  }
  const receipt = {
    key: input.key,
    payloadHash: input.payloadHash,
    runId: input.runId,
    createdAt: now
  }
  try {
    createAutomationRun(
      { ...operations, flush: () => {}, recordManualRun: () => {} },
      automation,
      now,
      'manual',
      { id: input.runId, viewer: input.viewer }
    )
    operations.state.viewerInvocations = [...retained, receipt]
    operations.state.viewerInvocationExpiredBefore = expiredBefore
    operations.flush()
  } catch (error) {
    operations.state.automationRuns = oldRuns
    operations.state.automations = oldAutomations
    operations.state.viewerInvocations = receipts
    operations.state.viewerInvocationExpiredBefore = oldExpiredBefore
    throw error
  }
  operations.recordManualRun()
  return { receipt, replayed: false }
}
