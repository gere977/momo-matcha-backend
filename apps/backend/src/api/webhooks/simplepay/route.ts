import crypto from "crypto"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, PaymentWebhookEvents } from "@medusajs/framework/utils"

// SimplePay requires the IPN acknowledgment body itself to be signed and to include
// a `receiveDate`, unlike Medusa's generic /hooks/payment/{provider} route which just
// replies 200 OK - that's why this integration needs its own route instead of relying
// on the built-in one (Barion's callback doesn't have this requirement).
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const rawBody = (req as any).rawBody?.toString("utf8") ?? JSON.stringify(req.body)
  const signatureHeader = req.headers["signature"] as string
  const body = req.body as Record<string, any>
  const currency = (body?.currency ?? "HUF").toUpperCase()

  // Mirrors the secretKeys map configured for the simplepay provider in medusa-config.ts.
  const secretKeys: Record<string, string | undefined> = {
    HUF: process.env.SIMPLEPAY_SECRET_KEY_HUF,
  }
  const secret = secretKeys[currency]

  if (!secret) {
    res.status(400).send("Webhook Error: no secret key configured for currency")
    return
  }

  const expectedSignature = crypto
    .createHmac("sha384", secret)
    .update(rawBody, "utf8")
    .digest("base64")

  const isValid =
    !!signatureHeader &&
    crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signatureHeader))

  if (!isValid) {
    res.status(400).send("Webhook Error: invalid signature")
    return
  }

  const eventBus = req.scope.resolve(Modules.EVENT_BUS)
  await eventBus.emit(
    {
      name: PaymentWebhookEvents.WebhookReceived,
      data: {
        provider: "simplepay_simplepay",
        payload: { data: body, rawData: rawBody, headers: req.headers },
      },
    },
    { delay: 5000, attempts: 3 }
  )

  // Required signed ack per SimplePay's IPN spec.
  const ackBody = {
    receiveDate: new Date().toISOString(),
    orderRef: body?.orderRef,
    transactionId: body?.transactionId,
  }
  const ackRaw = JSON.stringify(ackBody)
  const ackSignature = crypto.createHmac("sha384", secret).update(ackRaw, "utf8").digest("base64")

  res.setHeader("Signature", ackSignature)
  res.status(200).send(ackRaw)
}
