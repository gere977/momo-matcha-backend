import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  uploadFilesWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"

type Body = {
  product_id?: string
  b64?: string
  media_type?: string
}

const EXT_BY_MEDIA: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

// Save step: uploads the chosen AI image via the file module and appends it to
// the product's image gallery (also sets it as thumbnail when there is none).
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const { product_id, b64, media_type } = req.body ?? {}

  if (!product_id || !b64) {
    res.status(400).json({ message: "Hiányzó product_id vagy képadat (b64)." })
    return
  }

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    const { data: products } = await query.graph({
      entity: "product",
      filters: { id: product_id },
      fields: ["id", "title", "thumbnail", "images.url"],
    })
    const product: any = products[0]
    if (!product) {
      res.status(404).json({ message: "A termék nem található." })
      return
    }

    const mime = EXT_BY_MEDIA[media_type ?? ""] ? media_type! : "image/jpeg"
    const ext = EXT_BY_MEDIA[mime]
    const filename = `ai-studio/${product_id}-${Date.now()}.${ext}`

    const { result: uploaded } = await uploadFilesWorkflow(req.scope).run({
      input: {
        files: [
          {
            filename,
            mimeType: mime,
            content: Buffer.from(b64, "base64").toString("binary"),
            access: "public",
          },
        ],
      },
    })

    const url = uploaded[0]?.url
    if (!url) {
      res.status(502).json({ message: "A képfeltöltés nem adott vissza URL-t." })
      return
    }

    const existing = (product.images ?? []).map((i: any) => ({ url: i.url }))

    await updateProductsWorkflow(req.scope).run({
      input: {
        selector: { id: product_id },
        update: {
          images: [...existing, { url }],
          ...(product.thumbnail ? {} : { thumbnail: url }),
        },
      },
    })

    res.json({ url, product_id })
  } catch (e: any) {
    res
      .status(500)
      .json({ message: e?.message ?? "Ismeretlen hiba a mentés közben." })
  }
}
