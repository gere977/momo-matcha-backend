import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CRM_LITE_MODULE } from "../../../../modules/crm-lite"

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v25.0"
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`

type Body = {
  caption?: string
  asset_id?: string
  channels?: string[]
}

function backendUrl() {
  return (
    process.env.MEDUSA_BACKEND_URL ?? "https://admin.momomatcha.hu"
  ).replace(/\/$/, "")
}

async function graphPost(path: string, params: Record<string, string>) {
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error) {
    throw new Error(
      json.error?.message ?? `Meta API hiba (${res.status}) a ${path} hívásnál`
    )
  }
  return json
}

// POST /admin/marketing/publish — publishes a generated image + caption to
// the Momo Matcha Facebook Page and/or Instagram account via the Graph API.
//
// Required Railway variables (one-time setup in Meta Business Suite):
//   META_ACCESS_TOKEN — long-lived Page access token with pages_manage_posts,
//                       instagram_basic, instagram_content_publish
//   META_PAGE_ID      — Facebook Page id
//   META_IG_USER_ID   — Instagram Business account id linked to the Page
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const token = process.env.META_ACCESS_TOKEN
  const pageId = process.env.META_PAGE_ID
  const igUserId = process.env.META_IG_USER_ID

  const { caption = "", asset_id, channels = [] } = req.body ?? {}

  if (!token) {
    res.status(400).json({
      message:
        "A Meta összekötés nincs beállítva — add meg a META_ACCESS_TOKEN, META_PAGE_ID és META_IG_USER_ID változókat a Railway-en.",
    })
    return
  }
  if (!asset_id) {
    res.status(400).json({ message: "Előbb generálj és válassz ki egy képet." })
    return
  }
  if (!caption.trim()) {
    res.status(400).json({ message: "A poszt szövege (caption) hiányzik." })
    return
  }
  if (!channels.length) {
    res.status(400).json({ message: "Válassz legalább egy csatornát." })
    return
  }

  // Validate the asset exists before calling Meta.
  const crm = req.scope.resolve(CRM_LITE_MODULE) as any
  try {
    await crm.retrieveMarketingAsset(asset_id, { select: ["id"] })
  } catch {
    res.status(400).json({ message: "Ismeretlen kép (asset)." })
    return
  }

  const imageUrl = `${backendUrl()}/marketing-assets/${asset_id}`
  const results: Record<string, { ok: boolean; id?: string; error?: string }> =
    {}

  if (channels.includes("facebook")) {
    if (!pageId) {
      results.facebook = { ok: false, error: "META_PAGE_ID nincs beállítva." }
    } else {
      try {
        const fb = await graphPost(`/${pageId}/photos`, {
          url: imageUrl,
          message: caption,
          access_token: token,
        })
        results.facebook = { ok: true, id: fb.post_id ?? fb.id }
      } catch (e: any) {
        results.facebook = { ok: false, error: e.message }
      }
    }
  }

  if (channels.includes("instagram")) {
    if (!igUserId) {
      results.instagram = {
        ok: false,
        error: "META_IG_USER_ID nincs beállítva.",
      }
    } else {
      try {
        // Two-step IG publish: create a media container, then publish it.
        // Note: Instagram only accepts JPEG images from image_url.
        const container = await graphPost(`/${igUserId}/media`, {
          image_url: imageUrl,
          caption,
          access_token: token,
        })
        const published = await graphPost(`/${igUserId}/media_publish`, {
          creation_id: container.id,
          access_token: token,
        })
        results.instagram = { ok: true, id: published.id }
      } catch (e: any) {
        results.instagram = { ok: false, error: e.message }
      }
    }
  }

  const anyOk = Object.values(results).some((r) => r.ok)
  res.status(anyOk ? 200 : 502).json({ results })
}
