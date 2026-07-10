import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { submitNavInvoice } from "../../../../../utils/nav-invoice"

// POST /admin/orders/:id/nav-resubmit
// Manual retry for a failed (or missed) NAV invoice submission, triggered
// from the order page's NAV widget. Idempotent — an already-submitted order
// is reported as such instead of being double-invoiced.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const result = await submitNavInvoice(req.scope, req.params.id)

  if (result.status === "submitted") {
    res.json({ ok: true, transaction_id: result.transactionId })
    return
  }

  if (result.status === "skipped") {
    if (result.reason.startsWith("already_submitted")) {
      res.json({ ok: true, already_submitted: true })
      return
    }
    res.status(400).json({
      ok: false,
      message:
        result.reason === "not_configured"
          ? "A NAV technikai felhasználó adatai nincsenek beállítva (Railway Variables)."
          : result.reason === "not_huf"
            ? "Csak HUF pénznemű rendelések kerülnek NAV-beküldésre."
            : result.reason,
    })
    return
  }

  res.status(502).json({ ok: false, message: result.error })
}
