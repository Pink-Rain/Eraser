export function clampTableColumnWidth(width: number, minimum = 80, maximum = 900) {
  return Math.round(Math.max(minimum, Math.min(maximum, width)))
}

export function clampTableRowHeight(height: number) {
  return Math.round(Math.max(40, Math.min(240, height)))
}

