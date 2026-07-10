import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Kpi, PageHeader } from "../../lib/ui"

const StarIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="m10 2.8 2.1 4.6 5 .5-3.7 3.3 1 4.9L10 13.6l-4.4 2.5 1-4.9L2.9 7.9l5-.5L10 2.8Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
)

type Review = {
  id: string
  product_id: string
  product_title?: string | null
  email: string
  name: string
  rating: number
  text: string
  status: "pending" | "approved" | "rejected"
  created_at: string
}

async function fetchReviews(): Promise<Review[]> {
  const res = await fetch(`/admin/reviews?limit=200`, {
    credentials: "include",
  })
  if (!res.ok) throw new Error(`Nem sikerült betölteni (${res.status})`)
  const data = await res.json()
  return data.reviews ?? []
}

const STATUS_HU: Record<Review["status"], { label: string; color: "green" | "orange" | "red" }> = {
  pending: { label: "Jóváhagyásra vár", color: "orange" },
  approved: { label: "Jóváhagyva", color: "green" },
  rejected: { label: "Elutasítva", color: "red" },
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating}/5 csillag`} style={{ color: "#E0A800" }}>
      {"★".repeat(Math.max(1, Math.min(5, rating)))}
      <span style={{ color: "#ddd" }}>{"★".repeat(5 - Math.max(1, Math.min(5, rating)))}</span>
    </span>
  )
}

function ReviewCard({
  review,
  onModerate,
  busy,
}: {
  review: Review
  onModerate: (id: string, status: "approved" | "rejected") => void
  busy: boolean
}) {
  const status = STATUS_HU[review.status]
  return (
    <Container className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Text weight="plus">{review.name}</Text>
        <Stars rating={review.rating} />
        <Badge size="2xsmall" color={status.color}>
          {status.label}
        </Badge>
        <Text size="xsmall" className="text-ui-fg-muted">
          {new Date(review.created_at).toLocaleDateString("hu-HU")} ·{" "}
          {review.product_title ?? review.product_id} · {review.email}
        </Text>
      </div>
      <Text size="small" className="text-ui-fg-subtle">
        „{review.text}"
      </Text>
      <div className="flex gap-2">
        {review.status !== "approved" && (
          <Button
            size="small"
            disabled={busy}
            onClick={() => onModerate(review.id, "approved")}
          >
            Jóváhagyás
          </Button>
        )}
        {review.status !== "rejected" && (
          <Button
            size="small"
            variant="secondary"
            disabled={busy}
            onClick={() => onModerate(review.id, "rejected")}
          >
            Elutasítás
          </Button>
        )}
      </div>
    </Container>
  )
}

const ReviewsPage = () => {
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const { data: reviews = [], isLoading, isError } = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: fetchReviews,
  })

  const moderate = async (id: string, status: "approved" | "rejected") => {
    setBusyId(id)
    try {
      const res = await fetch(`/admin/reviews/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      toast.success(status === "approved" ? "Vélemény jóváhagyva." : "Vélemény elutasítva.")
    } catch {
      toast.error("Nem sikerült menteni.")
    } finally {
      setBusyId(null)
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] })
    }
  }

  const pending = reviews.filter((r) => r.status === "pending")
  const approved = reviews.filter((r) => r.status === "approved")
  const avg =
    approved.length > 0
      ? (
          approved.reduce((s, r) => s + r.rating, 0) / approved.length
        ).toFixed(1)
      : "–"

  return (
    <Container className="flex flex-col gap-y-5 p-0">
      <PageHeader
        title="Vélemények"
        subtitle="Vásárlói értékelések moderálása — csak a jóváhagyottak jelennek meg a webshopban"
      />

      {isError && (
        <div className="px-6">
          <Text className="text-ui-fg-error">
            Nem sikerült betölteni a véleményeket. Frissítsd az oldalt.
          </Text>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 px-6 md:grid-cols-3">
        <Kpi label="Jóváhagyásra vár" value={isLoading ? "…" : String(pending.length)} />
        <Kpi label="Jóváhagyott vélemény" value={isLoading ? "…" : String(approved.length)} />
        <Kpi label="Átlagos értékelés" value={isLoading ? "…" : `${avg} ★`} hint="A jóváhagyottak alapján" />
      </div>

      {pending.length > 0 && (
        <div className="flex flex-col gap-3 px-6">
          <Heading level="h2">Jóváhagyásra vár</Heading>
          {pending.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              onModerate={moderate}
              busy={busyId === r.id}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 px-6 pb-6">
        <Heading level="h2">Összes vélemény</Heading>
        {isLoading && <Text size="small">Betöltés…</Text>}
        {!isLoading && reviews.length === 0 && (
          <Text size="small" className="text-ui-fg-subtle">
            Még nincs vélemény. A kiszállítás után pár nappal automatikus
            e-mail kéri meg a vásárlókat az értékelésre.
          </Text>
        )}
        {reviews
          .filter((r) => r.status !== "pending")
          .map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              onModerate={moderate}
              busy={busyId === r.id}
            />
          ))}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Vélemények",
  icon: StarIcon,
})

export default ReviewsPage
