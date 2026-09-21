/** Poll only while the document is visible; an older response cannot replace a newer page. */
export function pollVisibleViewerRuns(
  refresh: (isCurrent: () => boolean) => Promise<void>
): () => void {
  let disposed = false
  let generation = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let inFlight = false
  const run = async () => {
    if (disposed || document.hidden || inFlight) {
      return
    }
    inFlight = true
    const current = ++generation
    try {
      await refresh(() => !disposed && current === generation && !document.hidden)
    } finally {
      inFlight = false
    }
  }
  const visibility = () => {
    generation++
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (!document.hidden) {
      void run()
      timer = setInterval(() => {
        void run()
      }, 5000)
    }
  }
  document.addEventListener('visibilitychange', visibility)
  visibility()
  return () => {
    disposed = true
    generation++
    if (timer) {
      clearInterval(timer)
    }
    document.removeEventListener('visibilitychange', visibility)
  }
}
