import { viewerAutomationTargetKey } from '../automations/viewer-automation-target'
import { resolveViewerWorkspaceProject } from '../plugins/viewer-workspace-project'
import { ipcMain } from 'electron'
import { join } from 'node:path'
import { realpath } from 'node:fs/promises'
import { z } from 'zod'
import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { PluginService } from '../plugins/plugin-service'
import { ViewerBindingStore } from '../plugins/viewer-binding-store'
import { ViewerInputStore } from '../automations/viewer-input-store'
import { ViewerRunService } from '../automations/viewer-run-service'
import { ViewerHostMethods } from '../plugins/viewer-host-methods'
import { readViewerDataset } from '../plugins/viewer-dataset'
import {
  viewerScopeSchema,
  type ViewerBinding,
  type ViewerScope,
  type ViewerCallContext
} from '../../shared/plugins/viewer-contract'

export function registerPluginViewerHandlers(
  store: Store,
  plugins: PluginService,
  runtime: OrcaRuntimeService
) {
  const bindings = new ViewerBindingStore(
    join(plugins.options.userDataPath, 'viewer-bindings.json')
  )
  const inputs = new ViewerInputStore(join(plugins.options.userDataPath, 'viewer-inputs'))
  const workspace = async (scope: ViewerScope) => {
    const target = await runtime.showTerminalWorkspaceLaunchScope(`id:${scope.workspaceId}`)
    const project = resolveViewerWorkspaceProject(target, {
      repos: store.getRepos(),
      projectGroups: store.getProjectGroups(),
      folderWorkspaces: store.getFolderWorkspaces()
    })
    return { ...project, root: await realpath(target.path) }
  }
  const validate = async (binding: ViewerBinding, execute = false) => {
    if (
      !plugins.getGrantedCapabilities(binding.pluginKey) ||
      (execute && !plugins.getGrantedCapabilities(binding.pluginKey)?.includes('automation:run'))
    ) {
      throw new Error('viewer_consent_required')
    }
    const { repoIds, root } = await workspace(binding)
    const current = bindings.get(binding)
    if (current?.revision !== binding.revision || root !== binding.workspaceRoot) {
      throw new Error('binding_changed')
    }
    const automation = runtime.showAutomation(binding.automationId, binding.expectedOwner)
    if (!repoIds.includes(automation.projectId)) {
      throw new Error('automation_project_changed')
    }
    store.assertAutomationOwnerFence({
      id: automation.id,
      expectedOwner: binding.expectedOwner,
      operation: execute ? 'execute' : 'read'
    })
    return automation
  }
  const runner = new ViewerRunService({
    inputs,
    validate: (binding) => validate(binding, true),
    receipts: () => store.listViewerInvocations(),
    runs: () => store.listAutomationRuns(),
    create: (automation, input) => store.createViewerInvocation(automation, input),
    dispatch: (automation, run, binding) =>
      runtime.dispatchViewerAutomation(automation, run, binding.expectedOwner),
    fail: (runId, error) => store.updateAutomationRun({ runId, status: 'dispatch_failed', error })
  })
  plugins.viewerHost = new ViewerHostMethods({
    bindings,
    validate,
    runner,
    runs: () => store.listAutomationRuns(),
    receipts: () => store.listViewerInvocations()
  })
  const ensurePanel = async (scope: ViewerScope) => {
    await plugins.whenReady()
    const plugin = plugins.getDiscovered().find((entry) => entry.pluginKey === scope.pluginKey)
    if (
      !plugin ||
      !('manifest' in plugin) ||
      !plugin.manifest.contributes.panels.some(
        (panel) => panel.id === scope.panelId && panel.placement === 'tab'
      ) ||
      !plugins.getGrantedCapabilities(scope.pluginKey)
    ) {
      throw new Error('viewer_unavailable')
    }
  }
  ipcMain.handle('plugins:viewerSettings', async (_event, raw: unknown) => {
    const scope = viewerScopeSchema.parse(raw)
    await ensurePanel(scope)
    const { repoIds } = await workspace(scope)
    const automations = store
      .listAutomations()
      .filter(
        (automation) =>
          repoIds.includes(automation.projectId) &&
          runtime.automationOwnerPrecondition(automation.id)?.selector.kind === 'self'
      )
    const binding = bindings.get(scope)
    return {
      datasetRelativePath: binding?.datasetRelativePath ?? '',
      automationId: binding?.automationId ?? '',
      automations: automations.map((automation) => ({ id: automation.id, name: automation.name })),
      configured: Boolean(binding?.automationTargetKey)
    }
  })
  ipcMain.handle('plugins:configureViewer', async (_event, raw: unknown) => {
    const args = viewerScopeSchema
      .extend({ datasetRelativePath: z.string().min(1).max(4096), automationId: z.string().min(1) })
      .strict()
      .parse(raw)
    const scope = viewerScopeSchema.parse({
      workspaceId: args.workspaceId,
      pluginKey: args.pluginKey,
      panelId: args.panelId
    })
    await ensurePanel(scope)
    const { repoIds, projectName, root } = await workspace(scope)
    const expectedOwner = { selector: { kind: 'self' as const } }
    const automation = runtime.showAutomation(args.automationId, expectedOwner)
    if (!repoIds.includes(automation.projectId)) {
      throw new Error('automation_project_mismatch')
    }
    const binding = {
      ...scope,
      schemaVersion: 1 as const,
      workspaceRoot: root,
      datasetRelativePath: args.datasetRelativePath,
      automationId: automation.id,
      automationTargetKey: viewerAutomationTargetKey(automation),
      expectedOwner,
      projectName,
      automationName: automation.name
    }
    await readViewerDataset(binding)
    // Owner and project may change while the file is being read.
    const current = runtime.showAutomation(args.automationId, expectedOwner)
    if (!repoIds.includes(current.projectId)) {
      throw new Error('automation_project_changed')
    }
    if (viewerAutomationTargetKey(current) !== binding.automationTargetKey) {
      throw new Error('automation_target_changed')
    }
    bindings.put(binding)
    return { configured: true }
  })
  return async (scope: ViewerScope): Promise<ViewerCallContext> => {
    await ensurePanel(scope)
    await workspace(scope)
    return { scope, bindingRevision: bindings.get(scope)?.revision ?? null }
  }
}
