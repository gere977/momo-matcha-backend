import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Select,
  Text,
  Textarea,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { PageHeader } from "../../lib/ui"

const SparkleIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M10 2.5 11.8 7.4 16.7 9.2 11.8 11 10 15.9 8.2 11 3.3 9.2 8.2 7.4 10 2.5Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <path
      d="M15.8 13.4l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"
      fill="currentColor"
    />
  </svg>
)

type Product = { id: string; title: string; thumbnail: string | null }

type GeneratedImage = { id: string; b64: string; media_type: string }

type CritiqueResult = {
  id: string
  score: number
  usable: boolean
  summary: string
  issues: string[]
}

type Critique = {
  results: CritiqueResult[]
  best_id: string | null
  improved_prompt: string
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.message || `Hiba (${res.status})`)
  }
  return data as T
}

async function fetchProducts(): Promise<Product[]> {
  const res = await fetch(
    `/admin/products?limit=200&fields=id,title,thumbnail&order=title`,
    { credentials: "include" }
  )
  if (!res.ok) throw new Error(`Nem sikerült betölteni a termékeket (${res.status})`)
  const data = await res.json()
  return data.products ?? []
}

const AiStudioPage = () => {
  const { data: products } = useQuery({
    queryKey: ["ai-studio-products"],
    queryFn: fetchProducts,
  })

  const [productId, setProductId] = useState("")
  const [notes, setNotes] = useState("")

  const [brief, setBrief] = useState("")
  const [researching, setResearching] = useState(false)

  const [count, setCount] = useState("2")
  const [prompt, setPrompt] = useState("")
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [generating, setGenerating] = useState(false)

  const [critique, setCritique] = useState<Critique | null>(null)
  const [critiquing, setCritiquing] = useState(false)

  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<string[]>([])

  const [error, setError] = useState("")

  const product = products?.find((p) => p.id === productId)
  const productTitle = product?.title ?? ""

  const run = async (fn: () => Promise<void>) => {
    setError("")
    try {
      await fn()
    } catch (e: any) {
      setError(e?.message ?? "Ismeretlen hiba.")
    }
  }

  const onResearch = () =>
    run(async () => {
      setResearching(true)
      try {
        const data = await postJson<{ brief: string }>("/admin/ai-studio/research", {
          product_title: productTitle,
          notes,
        })
        setBrief(data.brief)
      } finally {
        setResearching(false)
      }
    })

  const onGenerate = (imagePrompt?: string) =>
    run(async () => {
      setGenerating(true)
      try {
        const data = await postJson<{ prompt: string; images: GeneratedImage[] }>(
          "/admin/ai-studio/generate",
          {
            product_title: productTitle,
            brief: brief || undefined,
            image_prompt: imagePrompt,
            count: Number(count),
          }
        )
        setPrompt(data.prompt)
        setImages(data.images)
        setCritique(null)
        setSavedIds([])
      } finally {
        setGenerating(false)
      }
    })

  const onCritique = () =>
    run(async () => {
      setCritiquing(true)
      try {
        const data = await postJson<Critique>("/admin/ai-studio/critique", {
          product_title: productTitle,
          brief: brief || undefined,
          prompt: prompt || undefined,
          images: images.map(({ id, b64, media_type }) => ({ id, b64, media_type })),
        })
        setCritique(data)
      } finally {
        setCritiquing(false)
      }
    })

  const onSave = (img: GeneratedImage) =>
    run(async () => {
      setSavingId(img.id)
      try {
        await postJson<{ url: string }>("/admin/ai-studio/save", {
          product_id: productId,
          b64: img.b64,
          media_type: img.media_type,
        })
        setSavedIds((prev) => [...prev, img.id])
      } finally {
        setSavingId(null)
      }
    })

  const resultFor = (id: string) => critique?.results.find((r) => r.id === id)

  return (
    <Container className="flex flex-col gap-y-5 p-0">
      <PageHeader
        title="AI Stúdió"
        subtitle="Termékkép-generálás: kutatás → generálás → AI értékelés → mentés"
      />

      {error && (
        <div className="px-6">
          <Text className="text-ui-fg-error">{error}</Text>
        </div>
      )}

      {/* 1. Product + notes */}
      <div className="flex flex-col gap-3 px-6">
        <Heading level="h2">1. Termék kiválasztása</Heading>
        <div className="max-w-md">
          <Select value={productId} onValueChange={setProductId}>
            <Select.Trigger>
              <Select.Value placeholder="Válassz terméket…" />
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
        <Textarea
          placeholder="Megjegyzések a képhez (opcionális) — pl. „csokoládés hangulat, sötétebb tónusok, bambusz kanál is legyen rajta”"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>

      {/* 2. Research */}
      <div className="flex flex-col gap-3 px-6">
        <Heading level="h2">2. Ötletkutatás a weben (opcionális)</Heading>
        <div>
          <Button
            variant="secondary"
            disabled={!productId || researching}
            isLoading={researching}
            onClick={onResearch}
          >
            Kutatás indítása
          </Button>
        </div>
        {(brief || researching) && (
          <Textarea
            placeholder={researching ? "Kutatás folyamatban… (fél–egy perc)" : ""}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={10}
          />
        )}
        {brief && (
          <Text size="xsmall" className="text-ui-fg-muted">
            A briefet szabadon átírhatod, a generálás ezt fogja követni.
          </Text>
        )}
      </div>

      {/* 3. Generate */}
      <div className="flex flex-col gap-3 px-6">
        <Heading level="h2">3. Képgenerálás</Heading>
        <div className="flex items-center gap-3">
          <div className="w-28">
            <Select value={count} onValueChange={setCount}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {["1", "2", "3", "4"].map((n) => (
                  <Select.Item key={n} value={n}>
                    {n} kép
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <Button
            disabled={!productId || generating}
            isLoading={generating}
            onClick={() => onGenerate()}
          >
            Generálás
          </Button>
          {critique?.improved_prompt && (
            <Button
              variant="secondary"
              disabled={generating}
              onClick={() => onGenerate(critique.improved_prompt)}
            >
              Újragenerálás a javított prompttal
            </Button>
          )}
        </div>
        {prompt && (
          <Text size="xsmall" className="text-ui-fg-muted">
            Használt prompt: {prompt}
          </Text>
        )}
      </div>

      {/* 4. Results grid */}
      {images.length > 0 && (
        <div className="flex flex-col gap-3 px-6 pb-6">
          <div className="flex items-center gap-3">
            <Heading level="h2">4. Eredmények</Heading>
            <Button
              variant="secondary"
              size="small"
              disabled={critiquing}
              isLoading={critiquing}
              onClick={onCritique}
            >
              AI értékelés
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {images.map((img) => {
              const r = resultFor(img.id)
              const isBest = critique?.best_id === img.id
              const saved = savedIds.includes(img.id)
              return (
                <Container key={img.id} className="flex flex-col gap-2 p-3">
                  <img
                    src={`data:${img.media_type};base64,${img.b64}`}
                    alt={productTitle}
                    style={{ width: "100%", borderRadius: 8 }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {isBest && <Badge color="green">Legjobb</Badge>}
                    {r && (
                      <Badge color={r.usable ? "green" : "red"}>
                        {r.score}/10
                      </Badge>
                    )}
                    <Button
                      size="small"
                      variant={saved ? "secondary" : "primary"}
                      disabled={!productId || savingId === img.id || saved}
                      isLoading={savingId === img.id}
                      onClick={() => onSave(img)}
                    >
                      {saved ? "Mentve ✓" : "Mentés a termékhez"}
                    </Button>
                  </div>
                  {r && (
                    <>
                      <Text size="small">{r.summary}</Text>
                      {r.issues.length > 0 && (
                        <Text size="xsmall" className="text-ui-fg-muted">
                          Problémák: {r.issues.join("; ")}
                        </Text>
                      )}
                    </>
                  )}
                </Container>
              )
            })}
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "AI Stúdió",
  icon: SparkleIcon,
})

export default AiStudioPage
