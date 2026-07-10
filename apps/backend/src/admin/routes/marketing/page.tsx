import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  Heading,
  Input,
  Select,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { PageHeader } from "../../lib/ui"

const MegaphoneIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3 8.5v3a1 1 0 0 0 1 1h1.5l2 4a1 1 0 0 0 .9.5H9a1 1 0 0 0 1-1v-3.2l5.4 2.7A1 1 0 0 0 17 14.6V5.4a1 1 0 0 0-1.6-.9L10 7.5H4a1 1 0 0 0-1 1Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
)

type Product = { id: string; title: string }

async function fetchProducts(): Promise<Product[]> {
  const res = await fetch(`/admin/products?limit=200&fields=id,title&order=title`, {
    credentials: "include",
  })
  if (!res.ok) throw new Error(`Nem sikerült betölteni a termékeket (${res.status})`)
  const data = await res.json()
  return data.products ?? []
}

const CHANNELS = [
  { value: "instagram", label: "Instagram poszt (3 variáció)" },
  { value: "tiktok", label: "TikTok / Reels forgatókönyv (3 db)" },
  { value: "facebook", label: "Facebook poszt (2 variáció)" },
  { value: "blog", label: "SEO blogcikk (600–900 szó)" },
  { value: "email", label: "Hírlevél e-mail" },
  { value: "google-ads", label: "Google Ads hirdetésszövegek" },
]

const TOPIC_IDEAS = [
  "Hogyan készíts tökéletes matcha lattét otthon",
  "Matcha vs. kávé — nyugodt fókusz délutáni zuhanás nélkül",
  "5 hiba, amit mindenki elkövet matcha készítéskor",
  "Mi az a ceremonial grade, és miért számít?",
  "Epres matcha — a nyár itala",
  "Reggeli rituálé 10 percben",
]

const MarketingPage = () => {
  const { data: products } = useQuery({
    queryKey: ["marketing-products"],
    queryFn: fetchProducts,
  })

  const [channel, setChannel] = useState("instagram")
  const [topic, setTopic] = useState("")
  const [productId, setProductId] = useState("")
  const [notes, setNotes] = useState("")
  const [content, setContent] = useState("")
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState("")

  const productTitle = products?.find((p) => p.id === productId)?.title

  const onGenerate = async () => {
    setError("")
    setGenerating(true)
    try {
      const res = await fetch("/admin/marketing/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          topic: topic || undefined,
          product_title: productTitle || undefined,
          notes: notes || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || `Hiba (${res.status})`)
      setContent(data.content ?? "")
    } catch (e: any) {
      setError(e?.message ?? "Ismeretlen hiba.")
    } finally {
      setGenerating(false)
    }
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      toast.success("Szöveg a vágólapra másolva.")
    } catch {
      toast.error("Nem sikerült másolni — jelöld ki kézzel.")
    }
  }

  return (
    <Container className="flex flex-col gap-y-5 p-0">
      <PageHeader
        title="Marketing"
        subtitle="Forgalomterelő tartalmak generálása — poszt, videó-script, blog, hirdetés"
      />

      {error && (
        <div className="px-6">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      )}

      <div className="flex flex-col gap-3 px-6">
        <Heading level="h2">1. Mit készítsünk?</Heading>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select value={channel} onValueChange={setChannel}>
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {CHANNELS.map((c) => (
                <Select.Item key={c.value} value={c.value}>
                  {c.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
          <Select value={productId} onValueChange={setProductId}>
            <Select.Trigger>
              <Select.Value placeholder="Kiemelt termék (opcionális)…" />
            </Select.Trigger>
            <Select.Content>
              {(products ?? []).map((p) => (
                <Select.Item key={p.id} value={p.id}>
                  {p.title}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <Input
          placeholder="Téma — pl. „Hogyan készíts matcha lattét otthon”"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {TOPIC_IDEAS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(t)}
              className="rounded-full border border-ui-border-base px-3 py-1 text-xs text-ui-fg-subtle hover:bg-ui-bg-base-hover"
            >
              {t}
            </button>
          ))}
        </div>
        <Textarea
          placeholder="További kérés (opcionális) — pl. „nyereményjáték felhívással zárjon”"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
        <div>
          <Button
            disabled={generating || (!topic && !productTitle)}
            isLoading={generating}
            onClick={onGenerate}
          >
            Generálás
          </Button>
        </div>
        <Text size="xsmall" className="text-ui-fg-muted">
          A generált linkek UTM-paramétert kapnak, így a Statisztika oldal
          „Kampányok" táblázatában látod majd, melyik poszt hozott látogatót.
        </Text>
      </div>

      {content && (
        <div className="flex flex-col gap-3 px-6 pb-6">
          <div className="flex items-center gap-3">
            <Heading level="h2">2. Eredmény</Heading>
            <Button size="small" variant="secondary" onClick={onCopy}>
              Másolás vágólapra
            </Button>
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={22}
            className="font-mono text-sm"
          />
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Marketing",
  icon: MegaphoneIcon,
})

export default MarketingPage
