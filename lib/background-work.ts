import { getRequestExecutionContext } from "vinext/shims/request-context"

export function runInBackground(promise: Promise<unknown>, label: string) {
  const guarded = promise.catch((error) => {
    console.error(label, error instanceof Error ? error.message : "UNKNOWN_ERROR")
  })
  getRequestExecutionContext()?.waitUntil(guarded)
  return guarded
}
