// Public, customer-facing order number. Medusa's display_id is sequential
// (#1, #2, ...), which reveals the shop's real order volume, so customers see
// a scrambled-but-deterministic 5-digit number instead. The multiplier is
// coprime with 100000, making the mapping collision-free for the first
// 100 000 orders. Must stay in sync with the storefront's
// src/lib/util/order-number.ts (the order pages show the same number).
// NOTE: NAV invoice numbers stay on the sequential display_id - Hungarian
// invoice numbering must be gapless and sequential.
export function publicOrderNumber(displayId?: number | string | null): string {
  const id = Number(displayId ?? 0)
  return String((id * 48271 + 24680) % 100000).padStart(5, "0")
}
