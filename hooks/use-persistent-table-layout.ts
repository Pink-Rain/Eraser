import { usePersistentState } from "@/hooks/use-persistent-state"

export type PersistentTableLayout = {
  columnWidths: Record<string, number>
  rowHeight: number
}

function isPersistentTableLayout(value: unknown): value is PersistentTableLayout {
  if (!value || typeof value !== "object") return false
  const candidate = value as { columnWidths?: unknown; rowHeight?: unknown }
  if (!candidate.columnWidths || typeof candidate.columnWidths !== "object" || Array.isArray(candidate.columnWidths)) return false
  if (typeof candidate.rowHeight !== "number" || !Number.isFinite(candidate.rowHeight)) return false
  return Object.entries(candidate.columnWidths).every(([key, width]) => key.length > 0 && typeof width === "number" && Number.isFinite(width))
}

export function clampTableColumnWidth(width: number, minimum = 80, maximum = 900) {
  return Math.round(Math.max(minimum, Math.min(maximum, width)))
}

export function clampTableRowHeight(height: number) {
  return Math.round(Math.max(40, Math.min(240, height)))
}

export function usePersistentTableLayout(key: string, initial: PersistentTableLayout) {
  return usePersistentState(key, initial, isPersistentTableLayout)
}
