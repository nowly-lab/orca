import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  isPageStorageKey,
  isPageStorageKeyForHost,
  pageStorageKeysForHost
} from './page-storage-keys'

/**
 * The allowlisted keys as the app holds them, as a plain map because `init` is built synchronously.
 *
 * Module-scoped, and that is the whole point of it. Two of these keys are written by the app's own
 * native screens — the pinned list and the last visited worktree — and a mirror that only the
 * shell's own mount kept would answer the next `init` with the store as it was before that write,
 * so a page that reloads opens its drawer on the repo the user just left rather than the one they
 * are in. Every writer of an allowlisted key notes it here, so what `init` carries is current at
 * the moment it is built; the store read below only seeds it.
 */
const mirror = new Map<string, string>()

/** Counts writes, so a store read that started before one cannot land on top of it. */
let writeCount = 0

/** This host's allowlisted keys as they stand, which is what the next `init` carries. */
export function readPageStorageForHost(hostId: string): Readonly<Record<string, string>> {
  const held: Record<string, string> = {}
  for (const key of pageStorageKeysForHost(hostId)) {
    const value = mirror.get(key)
    if (value !== undefined) {
      held[key] = value
    }
  }
  return held
}

/**
 * Seats the map on the app's store for one host.
 *
 * Never rejects: a store that would not answer leaves the last map standing, so the page is primed
 * from something stale rather than from nothing, and the next ask tries again.
 */
export async function hydratePageStorage(hostId: string): Promise<void> {
  const startedAt = writeCount
  let pairs: readonly (readonly [string, string | null])[]
  try {
    pairs = await AsyncStorage.multiGet(pageStorageKeysForHost(hostId))
  } catch {
    return
  }
  if (writeCount !== startedAt) {
    // A write landed while the read was open, so the read is already behind it. The write stands
    // and the next ask re-reads, rather than this answer putting the older value back.
    return
  }
  for (const [key, value] of pairs) {
    // Checked again here rather than trusted from the key list: this is the value the page is
    // handed, and the allowlist is all that stands between it and the app's namespace.
    if (!isPageStorageKeyForHost(key, hostId)) {
      continue
    }
    if (value === null) {
      mirror.delete(key)
    } else {
      mirror.set(key, value)
    }
  }
}

/**
 * Notes a write the app made through its own store, so the next `init` carries it.
 *
 * For the app's writers, which persist the value themselves. Anything outside the allowlist is
 * dropped here, so nothing the page was never handed can sit in the map it is answered from.
 */
export function mirrorPageStorageWrite(key: string, value: string | null): void {
  if (!isPageStorageKey(key)) {
    return
  }
  writeCount += 1
  if (value === null) {
    mirror.delete(key)
  } else {
    mirror.set(key, value)
  }
}

/** The page's own write: noted first, then persisted, because `init` is answered from the map. */
export function writePageStorage(key: string, value: string | null): void {
  mirrorPageStorageWrite(key, value)
  void (value === null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, value)).catch(
    () => {
      // Nothing is owed to the page for a notify, and a pin that failed to persist is not a reason
      // to take the workspace off screen.
    }
  )
}
