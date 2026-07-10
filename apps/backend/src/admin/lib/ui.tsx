import { Container, Heading, Text } from "@medusajs/ui"

// Shared bits for the custom Momo Matcha admin pages — one source of truth
// instead of each page re-declaring its own copy.

export const MATCHA = "#6A8D53"
export const ACCENT = "#E06B85"

export function formatMoney(amount: number, currency?: string) {
  try {
    return new Intl.NumberFormat("hu-HU", {
      style: "currency",
      currency: (currency || "HUF").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount ?? 0)
  } catch {
    return `${Math.round(amount ?? 0)} ${(currency || "").toUpperCase()}`
  }
}

export function Kpi({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <Container className="flex flex-col gap-1 p-4">
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Heading level="h2" style={{ color: MATCHA }}>
        {value}
      </Heading>
      {hint && (
        <Text size="xsmall" className="text-ui-fg-muted">
          {hint}
        </Text>
      )}
    </Container>
  )
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
}) {
  return (
    <div
      className="flex items-center justify-between px-6 py-4"
      style={{ borderBottom: `2px solid ${MATCHA}` }}
    >
      <div>
        <Heading level="h1">{title}</Heading>
        {subtitle && (
          <Text size="small" className="text-ui-fg-subtle">
            {subtitle}
          </Text>
        )}
      </div>
      {right}
    </div>
  )
}
