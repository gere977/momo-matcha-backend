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

type GeneratedAsset = {
  id: string
  b64: string
  media_type: string
  url: string
}

type MetaStatus = { configured: boolean; facebook: boolean; instagram: boolean }

async function fetchMetaStatus(): Promise<MetaStatus> {
  const res = await fetch(`/admin/marketing/meta-status`, {
    credentials: "include",
  })
  if (!res.ok) return { configured: false, facebook: false, instagram: false }
  return res.json()
}

const MarketingPage = () => {
  const { data: products } = useQuery({
    queryKey: ["marketing-products"],
    queryFn: fetchProducts,
  })
  const { data: meta } = useQuery({
    queryKey: ["marketing-meta-status"],
    queryFn: fetchMetaStatus,
  })

  const [channel, setChannel] = useState("instagram")
  const [topic, setTopic] = useState("")
  const [productId, setProductId] = useState("")
  const [notes, setNotes] = useState("")
  const [content, setContent] = useState("")
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState("")

  const [images, setImages] = useState<GeneratedAsset[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [generatingImg, setGeneratingImg] = useState(false)

  const [caption, setCaption] = useState("")
  const [publishFb, setPublishFb] = useState(true)
  const [publishIg, setPublishIg] = useState(true)
  const [publishing, setPublishing] = useState(false)

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

  const onGenerateImage = async () => {
    setError("")
    setGeneratingImg(true)
    try {
      const res = await fetch("/admin/marketing/generate-image", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic || undefined,
          product_title: productTitle || undefined,
          notes: notes || undefined,
          count: 2,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || `Hiba (${res.status})`)
      setImages(data.images ?? [])
      setSelectedAssetId(data.images?.[0]?.id ?? null)
    } catch (e: any) {
      setError(e?.message ?? "Ismeretlen hiba.")
    } finally {
      setGeneratingImg(false)
    }
  }

  const onPublish = async () => {
    setError("")
    setPublishing(true)
    try {
      const channels = [
        ...(publishFb ? ["facebook"] : []),
        ...(publishIg ? ["instagram"] : []),
      ]
      const res = await fetch("/admin/marketing/publish", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption,
          asset_id: selectedAssetId,
          channels,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && !data?.results) {
        throw new Error(data?.message || `Hiba (${res.status})`)
      }
      const results = data.results ?? {}
      for (const [ch, r] of Object.entries(results) as [string, any][]) {
        if (r.ok) {
          toast.success(`${ch === "facebook" ? "Facebook" : "Instagram"}: közzétéve ✓`)
        } else {
          toast.error(`${ch === "facebook" ? "Facebook" : "Instagram"}: ${r.error}`)
        }
      }
    } catch (e: any) {
      setError(e?.message ?? "Ismeretlen hiba.")
    } finally {
      setPublishing(false)
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
        <div className="flex flex-col gap-3 px-6">
          <div className="flex items-center gap-3">
            <Heading level="h2">2. Szöveg</Heading>
            <Button size="small" variant="secondary" onClick={onCopy}>
              Másolás vágólapra
            </Button>
            <Button
              size="small"
              variant="secondary"
              onClick={() => setCaption(content)}
            >
              Átvétel a poszt szövegébe
            </Button>
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={16}
            className="font-mono text-sm"
          />
        </div>
      )}

      <div className="flex flex-col gap-3 px-6">
        <div className="flex items-center gap-3">
          <Heading level="h2">3. Kép a poszthoz</Heading>
          <Button
            size="small"
            variant="secondary"
            disabled={generatingImg || (!topic && !productTitle)}
            isLoading={generatingImg}
            onClick={onGenerateImage}
          >
            Kép generálása (2 variáció)
          </Button>
        </div>
        {images.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {images.map((img) => {
              const selected = selectedAssetId === img.id
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setSelectedAssetId(img.id)}
                  className="text-left"
                  style={{
                    border: selected
                      ? "3px solid #6A8D53"
                      : "3px solid transparent",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={`data:${img.media_type};base64,${img.b64}`}
                    alt="Generált poszt-kép"
                    style={{ width: "100%", display: "block" }}
                  />
                  <div className="p-2">
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {selected ? "✓ Kiválasztva" : "Kattints a kiválasztáshoz"}
                    </Text>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 px-6 pb-6">
        <Heading level="h2">4. Közzététel (Facebook / Instagram)</Heading>
        {!meta?.configured ? (
          <Container className="flex flex-col gap-2 p-4">
            <Text size="small" weight="plus">
              A Meta-összekötés még nincs beállítva.
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              Egyszeri beállítás: 1) Facebook-oldal + hozzá kapcsolt Instagram
              Business fiók, 2) app a developers.facebook.com-on, 3) hosszú
              élettartamú Page access token a következő jogosultságokkal:
              pages_manage_posts, instagram_basic, instagram_content_publish.
              Ezután a Railway Variables-be: META_ACCESS_TOKEN, META_PAGE_ID,
              META_IG_USER_ID. Az oldal ezután innen közvetlenül posztol.
            </Text>
          </Container>
        ) : (
          <>
            <Textarea
              placeholder="A poszt szövege (caption) — a fenti szövegből az „Átvétel” gombbal is idehozhatod, majd szerkesztheted"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
            />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={publishFb}
                  disabled={!meta.facebook}
                  onChange={(e) => setPublishFb(e.target.checked)}
                />
                Facebook{!meta.facebook && " (nincs META_PAGE_ID)"}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={publishIg}
                  disabled={!meta.instagram}
                  onChange={(e) => setPublishIg(e.target.checked)}
                />
                Instagram{!meta.instagram && " (nincs META_IG_USER_ID)"}
              </label>
              <Button
                disabled={
                  publishing ||
                  !selectedAssetId ||
                  !caption.trim() ||
                  (!publishFb && !publishIg)
                }
                isLoading={publishing}
                onClick={onPublish}
              >
                Közzététel most
              </Button>
            </div>
            <Text size="xsmall" className="text-ui-fg-muted">
              A közzétételhez válassz ki egy generált képet (3. lépés) és adj
              meg szöveget. Fizetett hirdetéshez: tedd közzé itt, majd a Meta
              Business Suite-ban „Boost”-old a posztot.
            </Text>
          </>
        )}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Marketing",
  icon: MegaphoneIcon,
})

export default MarketingPage
