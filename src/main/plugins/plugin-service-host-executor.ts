import type { PluginEventName } from '../../shared/plugins/plugin-manifest'
import type { PluginCapabilityKind } from '../../shared/plugins/plugin-capabilities'
import type { ViewerCallContext } from '../../shared/plugins/viewer-contract'
import type { PluginAuditLog } from './plugin-audit-log'
import type { ViewerHostMethods } from './viewer-host-methods'
import { bindPluginHostServices, type PluginRuntimeDelegate } from './plugin-host-service-bindings'
import { executePluginHostCallRequest } from './plugin-host-call-adapter'

export function executePluginServiceHostCall(input: {
  pluginKey: string
  method: string
  params: unknown
  options: { viaPanel: boolean; viewer?: ViewerCallContext }
  delegate: PluginRuntimeDelegate | null
  viewerHost?: ViewerHostMethods
  pluginsDataDir: string
  audit: PluginAuditLog
  getCapabilities(pluginKey: string): PluginCapabilityKind[] | null
  subscribeEvents(pluginKey: string, events: PluginEventName[]): PluginEventName[]
}) {
  return executePluginHostCallRequest({
    pluginKey: input.pluginKey,
    request: { method: input.method, params: input.params },
    viaPanel: input.options.viaPanel,
    resolvePolicy: (pluginKey) => ({
      viewer: input.options.viewer,
      grantedCapabilities: input.getCapabilities(pluginKey),
      audit: input.audit,
      services: input.delegate
        ? bindPluginHostServices({
            delegate: input.delegate,
            viewer: input.viewerHost,
            pluginsDataDir: input.pluginsDataDir,
            subscribeEvents: input.subscribeEvents
          })
        : null
    })
  })
}
