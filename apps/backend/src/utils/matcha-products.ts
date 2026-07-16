const MATCHA_HANDLES = new Set([
  "original-premium-momo-matcha",
  "epres-premium-momo-matcha",
  "vanilias-premium-momo-matcha",
  "csokoladas-premium-momo-matcha",
])

export function containsMatchaProduct(items: any[] | null | undefined) {
  return Boolean(
    items?.some((item) => isMatchaProduct(item))
  )
}

export function isMatchaProduct(item: any) {
  return MATCHA_HANDLES.has(String(item?.product_handle ?? ""))
}
