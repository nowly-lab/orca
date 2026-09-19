import type { Automation, AutomationRun } from '../../shared/automations-types'
import type { AutomationOwnerPrecondition } from '../../shared/automation-owner-precondition'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import type { AutomationService } from './service'

export function dispatchViewerRunFenced(
  store: RuntimeStore | null,
  service: AutomationService | null,
  automation: Automation,
  run: AutomationRun,
  expectedOwner: AutomationOwnerPrecondition
): Promise<AutomationRun> {
  if (!service || !store?.assertAutomationOwnerFence) {
    throw new Error('runtime_unavailable')
  }
  if (expectedOwner.selector.kind !== 'self') {
    throw new Error('unsupported_viewer_host')
  }
  store.assertAutomationOwnerFence({ id: automation.id, expectedOwner, operation: 'execute' })
  return service.dispatchViewerRun(automation, run)
}
