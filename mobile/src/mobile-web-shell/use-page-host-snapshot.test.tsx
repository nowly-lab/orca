import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const doubles = vi.hoisted(() => ({
  store: new Map<string, string>(),
  writes: [] as { key: string; value: string | null }[],
  hostsReject: false
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    multiGet: async (keys: readonly string[]) =>
      keys.map((key) => [key, doubles.store.get(key) ?? null]),
    setItem: async (key: string, value: string) => {
      doubles.writes.push({ key, value })
      doubles.store.set(key, value)
    },
    removeItem: async (key: string) => {
      doubles.writes.push({ key, value: null })
      doubles.store.delete(key)
    }
  }
}))
vi.mock('../transport/host-store', () => ({
  loadHosts: async () => {
    if (doubles.hostsReject) {
      throw new Error('the keychain would not answer')
    }
    return [{ id: 'host-1', name: 'Host One', endpoint: 'ws://host-1', lastConnected: 3 }]
  }
}))

import { usePageHostSnapshot, type PageHostSnapshotView } from './use-page-host-snapshot'

const PINS = 'orca:pins:host-1'

async function mount(): Promise<{ view: () => PageHostSnapshotView }> {
  const held: { view: PageHostSnapshotView | null } = { view: null }
  function Probe(): null {
    held.view = usePageHostSnapshot('host-1')
    return null
  }
  await act(async () => {
    create(createElement(Probe))
  })
  return {
    view: () => {
      if (held.view === null) {
        throw new Error('the hook did not mount')
      }
      return held.view
    }
  }
}

beforeEach(() => {
  doubles.store.clear()
  doubles.writes.length = 0
  doubles.hostsReject = false
})

describe('what the shell puts on every init', () => {
  it('carries the write the page just made, not the map it was primed with', async () => {
    doubles.store.set(PINS, '["one"]')
    const mounted = await mount()
    expect(mounted.view().readStorage()).toEqual({ [PINS]: '["one"]' })
    // The device repro: the page writes, its document reloads inside this same mount, and the
    // `init` that primes the new document has to carry the write rather than what came before it.
    await act(async () => {
      mounted.view().writeStorage(PINS, '["one","two"]')
    })
    expect(mounted.view().readStorage()).toEqual({ [PINS]: '["one","two"]' })
    expect(doubles.writes).toEqual([{ key: PINS, value: '["one","two"]' }])
  })

  it('drops a key the page removed', async () => {
    doubles.store.set(PINS, '["one"]')
    const mounted = await mount()
    await act(async () => {
      mounted.view().writeStorage(PINS, null)
    })
    expect(mounted.view().readStorage()).toEqual({})
  })

  it('picks up what the app changed underneath, on the next ask', async () => {
    const mounted = await mount()
    expect(mounted.view().readStorage()).toEqual({})
    doubles.store.set(PINS, '["set-by-the-app"]')
    await act(async () => {
      mounted.view().refreshStorage()
    })
    expect(mounted.view().readStorage()).toEqual({ [PINS]: '["set-by-the-app"]' })
  })

  it('never carries another host key, whatever the store holds', async () => {
    doubles.store.set(PINS, '["mine"]')
    doubles.store.set('orca:pins:host-2', '["theirs"]')
    const mounted = await mount()
    await act(async () => {
      mounted.view().refreshStorage()
    })
    expect(mounted.view().readStorage()).toEqual({ [PINS]: '["mine"]' })
    // And a write for one is refused rather than mirrored, so a later read cannot answer with it.
    await act(async () => {
      mounted.view().writeStorage('orca:pins:host-2', '["theirs"]')
    })
    expect(mounted.view().readStorage()).toEqual({ [PINS]: '["mine"]' })
  })
})

describe('a host the app store would not answer for', () => {
  it('says so rather than leaving the caller holding a session with no host', async () => {
    doubles.hostsReject = true
    const mounted = await mount()
    expect(mounted.view().snapshot).toBeNull()
    expect(mounted.view().unreadable).toBe(true)
  })

  it('is not the same as a host that is simply not there', async () => {
    const mounted = await mount()
    expect(mounted.view().snapshot?.host.id).toBe('host-1')
    expect(mounted.view().unreadable).toBe(false)
  })
})
