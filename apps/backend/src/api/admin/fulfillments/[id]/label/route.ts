import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Logger } from "@medusajs/framework/types"
import FoxpostFulfillmentService from "../../../../../modules/fulfillment-foxpost/service"

// GET /admin/fulfillments/:id/label
// Returns the carrier shipping label PDF for a fulfillment. GLS labels are
// stored on the fulfillment at creation time (gls_label_base64); FoxPost
// labels are fetched on demand from the FoxPost API using the stored barcode.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER)

  const {
    data: [fulfillment],
  } = await query.graph({
    entity: "fulfillment",
    fields: ["id", "provider_id", "data"],
    filters: { id: req.params.id },
  })

  if (!fulfillment) {
    return res.status(404).json({ message: "A teljesítés nem található." })
  }

  const data = (fulfillment.data ?? {}) as Record<string, unknown>
  const providerId = fulfillment.provider_id ?? ""
  let base64: string | undefined
  let filename = `cimke-${fulfillment.id}.pdf`

  if (providerId.startsWith("gls") && typeof data.gls_label_base64 === "string") {
    base64 = data.gls_label_base64
    filename = `gls-cimke-${data.gls_parcel_number ?? fulfillment.id}.pdf`
  } else if (providerId.startsWith("foxpost") && data.foxpost_barcode) {
    if (!process.env.FOXPOST_API_KEY) {
      return res.status(400).json({
        message:
          "A FOXPOST_API_KEY környezeti változó nincs beállítva - a címke nem kérhető le a FoxPost API-tól.",
      })
    }
    const foxpost = new FoxpostFulfillmentService(
      { logger },
      {
        apiKey: process.env.FOXPOST_API_KEY,
        environment:
          (process.env.FOXPOST_ENVIRONMENT as "test" | "prod") || "test",
      }
    )
    const documents = await foxpost.getFulfillmentDocuments(data)
    base64 = documents?.[0]?.base_64
    filename = `foxpost-cimke-${data.foxpost_barcode}.pdf`
  }

  if (!base64) {
    return res.status(404).json({
      message:
        "Ehhez a teljesítéshez nem tartozik nyomtatható címke (kézi szállítási mód, vagy a csomag nem lett bejelentve a futárszolgálatnak).",
    })
  }

  const pdf = Buffer.from(base64, "base64")
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`)
  return res.send(pdf)
}
