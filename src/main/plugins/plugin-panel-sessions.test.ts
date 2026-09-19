import { describe, expect, it } from 'vitest'
import { PluginPanelSessions } from './plugin-panel-sessions'

const binding = {
  pluginKey: 'orca-samples.demo',
  panelId: 'dashboard',
  rootDir: '/plugins/orca-samples.demo/hash-one',
  manifestRevision: 'manifest-v1'
}

describe('PluginPanelSessions', () => {
  it('keeps workspace identity fixed and rotates on binding revision changes', () => {
    const sessions = new PluginPanelSessions()
    const viewer = {
      scope: { workspaceId: 'a', pluginKey: binding.pluginKey, panelId: binding.panelId },
      bindingRevision: 'one'
    }
    const token = sessions.issue('renderer:1', { ...binding, viewer })
    const other = sessions.issue('renderer:1', {
      ...binding,
      viewer: { ...viewer, scope: { ...viewer.scope, workspaceId: 'b' } }
    })
    expect(other).not.toBe(token)
    expect(sessions.resolve('renderer:1', token)?.viewer?.scope.workspaceId).toBe('a')
    expect(
      sessions.issue('renderer:1', { ...binding, viewer: { ...viewer, bindingRevision: 'two' } })
    ).not.toBe(token)
    expect(sessions.resolve('renderer:2', token)).toBeNull()
  })
  it('binds an opaque token to its transport owner and panel revision', () => {
    const sessions = new PluginPanelSessions()
    const token = sessions.issue('renderer:1', binding)

    expect(token).toHaveLength(43)
    expect(sessions.resolve('renderer:1', token)).toEqual(binding)
    expect(sessions.resolve('renderer:2', token)).toBeNull()
    expect(sessions.issue('renderer:1', binding)).toBe(token)
    expect(sessions.issue('renderer:1', { ...binding, rootDir: '/plugins/new' })).not.toBe(token)
    expect(sessions.issue('renderer:1', { ...binding, manifestRevision: 'manifest-v2' })).not.toBe(
      token
    )
  })

  it('revokes every session owned by a disconnected transport', () => {
    const sessions = new PluginPanelSessions()
    const first = sessions.issue('connection:one', binding)
    const second = sessions.issue('connection:one', { ...binding, panelId: 'secondary' })
    const other = sessions.issue('connection:two', binding)

    sessions.revokeOwner('connection:one')

    expect(sessions.resolve('connection:one', first)).toBeNull()
    expect(sessions.resolve('connection:one', second)).toBeNull()
    expect(sessions.resolve('connection:two', other)).toEqual(binding)
  })
})
