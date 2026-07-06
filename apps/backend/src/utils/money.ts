// Totals coming out of query.graph are BigNumber instances, not plain
// numbers. Passing them straight into email templates / NAV XML breaks
// `typeof x === "number"` guards and Intl formatting, so normalize first.
//
// NOTE: order-level totals (total, item_total, ...) are only computed
// correctly when the query also fetches the full item data ("items.*") -
// with a narrow item field list the totals silently exclude the items.
export function asNumber(value: unknown): number {
  if (value == null) {
    return 0
  }
  if (typeof value === "number") {
    return value
  }
  const numeric =
    (value as { numeric?: unknown }).numeric ??
    (value as { value?: unknown }).value ??
    value
  const parsed = Number(numeric)
  return Number.isNaN(parsed) ? 0 : parsed
}
