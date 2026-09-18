import { useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { loadHosts } from '../transport/host-store'
import type { BridgeInitHost } from './bridge/bridge-envelope'
import { isPageStorageKeyForHost, pageStorageKeysForHost } from './page-storage-keys'

export type PageHostSnapshot = {
  host: BridgeInitHost
}

export type PageHostSnapshotView = {
  /** Null while the profile read is in flight, and for a host that is not in the store. */
  snapshot: PageHostSnapshot | null
  /**
   * The profile read rejected. No host is ever built from it, so without this the session sits in
   * `ready` with the view un-hidden, no host behind it, and the page re-posting `ready` forever.
   */
  unreadable: boolean
  /**
   * The allowlisted keys as the shell currently holds them, for the host to put on every `init`.
   * Synchronous because `init` is; `refreshStorage` is what keeps it current.
   */
  readStorage: () => Readonly<Record<string, string>>
  /** Re-reads the app's store into that map. Cheap, and asked for whenever a page asks to start. */
  refreshStorage: () => void
  /** Applies one page write to the app's store and to the map the next `init` will carry. */
  writeStorage: (key: string, value: string | null) => void
}

/**
 * What the page cannot read for itself: this host, and the few stored keys its screens keep.
 *
 * `expo-secure-store` is `{}` on web and AsyncStorage's web build is `window.localStorage`, which
 * the page has none of — Android turns DOM storage off and on iOS the origin is the session id, so
 * a page-side write is gone on the next remount. Both cross in `init` instead.
 *
 * The profile is read once per mount, because a host's identity does not change under one. The
 * keys are read per `init` answer, because they do: the page writes them, and a document that
 * reloads inside one mount would otherwise be primed from before its own writes.
 */
export function usePageHostSnapshot(hostId: string): PageHostSnapshotView {
  const [snapshot, setSnapshot] = useState<PageHostSnapshot | null>(null)
  const [unreadable, setUnreadable] = useState(false)
  const storageRef = useRef<Readonly<Record<string, string>>>({})

  const refreshStorage = useCallback((): void => {
    void AsyncStorage.multiGet(pageStorageKeysForHost(hostId)).then(
      (pairs) => {
        const next: Record<string, string> = {}
        for (const [key, value] of pairs) {
          // Checked again here rather than trusted from the key list: this is the value the page
          // is handed, and the allowlist is all that stands between it and the app's namespace.
          if (value !== null && isPageStorageKeyForHost(key, hostId)) {
            next[key] = value
          }
        }
        storageRef.current = next
      },
      () => {
        // A store that would not answer leaves the last map standing. The page is primed from
        // something stale rather than from nothing, and the next ask tries again.
      }
    )
  }, [hostId])

  useEffect(() => {
    let stale = false
    setSnapshot(null)
    setUnreadable(false)
    storageRef.current = {}
    refreshStorage()
    void loadHosts().then(
      (hosts) => {
        if (stale) {
          return
        }
        const found = hosts.find((profile) => profile.id === hostId)
        setSnapshot(
          found
            ? {
                host: {
                  id: found.id,
                  name: found.name,
                  endpoint: found.endpoint,
                  lastConnected: found.lastConnected
                }
              }
            : null
        )
      },
      () => {
        // A keychain read that failed is not a host that is gone, and it is not something to wait
        // out either: nothing retries it, so the caller is told rather than left holding a `ready`
        // session with no host behind it.
        if (!stale) {
          setUnreadable(true)
        }
      }
    )
    return () => {
      stale = true
    }
  }, [hostId, refreshStorage])

  const writeStorage = useCallback(
    (key: string, value: string | null): void => {
      // The host refuses a key outside this list before this ever runs. Held to it here too, so the
      // map cannot hold something the next refresh would drop and answer a read with it meanwhile.
      if (!isPageStorageKeyForHost(key, hostId)) {
        return
      }
      // Mirrored before it is persisted, and that order is the point: the next `init` is answered
      // from this map, and a document that reloads between the write and the store settling would
      // otherwise be primed from before its own write.
      const next = { ...storageRef.current }
      if (value === null) {
        delete next[key]
      } else {
        next[key] = value
      }
      storageRef.current = next
      writePageStorage(key, value)
    },
    [hostId]
  )

  return {
    snapshot,
    unreadable,
    readStorage: useCallback(() => storageRef.current, []),
    refreshStorage,
    writeStorage
  }
}

/** The page's writes, applied to the app's own store. Allowlisted by the envelope before it lands. */
export function writePageStorage(key: string, value: string | null): void {
  void (value === null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, value)).catch(
    () => {
      // Nothing is owed to the page for a notify, and a pin that failed to persist is not a reason
      // to take the workspace off screen.
    }
  )
}
