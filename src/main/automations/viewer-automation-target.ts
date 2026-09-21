import { createHash } from 'node:crypto'
import type { Automation } from '../../shared/automations-types'

/** Capture destination identity, not editable prompt/schedule fields. */
export function viewerAutomationTargetKey(automation: Automation): string {
  const context = automation.runContext
  return createHash('sha256')
    .update(
      JSON.stringify([
        automation.projectId,
        automation.executionTargetType,
        automation.executionTargetId,
        automation.executionTargetGeneration ?? null,
        automation.schedulerOwner,
        automation.workspaceMode,
        automation.workspaceId,
        automation.baseBranch,
        context
          ? [
              context.projectId,
              context.hostId,
              context.projectHostSetupId,
              context.repoId,
              context.path
            ]
          : null
      ])
    )
    .digest('hex')
}
