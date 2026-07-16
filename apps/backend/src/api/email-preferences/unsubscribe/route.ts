import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  suppressMarketingEmail,
  verifyEmailPreferenceToken,
} from "../../../utils/email-preferences"

function successPage(): string {
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Leiratkozás · Momo Matcha</title></head><body style="margin:0;background:#F7F2E8;color:#234C38;font-family:Arial,sans-serif;"><main style="max-width:560px;margin:72px auto;padding:36px;background:#FFFDF7;border-radius:24px;text-align:center;"><h1 style="margin:0 0 14px;font-family:Georgia,serif;">Sikeresen leiratkoztál.</h1><p style="line-height:1.6;color:#535C52;">Nem küldünk több marketing- és életciklus e-mailt erre a címre. A rendeléseidhez és a fiókod biztonságához kapcsolódó fontos üzeneteket továbbra is megkapod.</p><a href="https://momomatcha.hu" style="display:inline-block;margin-top:16px;color:#234C38;font-weight:700;">Vissza a Momo Matchához</a></main></body></html>`
}

function confirmationPage(token: string): string {
  const safeToken = token.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>Leiratkozás · Momo Matcha</title></head><body style="margin:0;background:#F7F2E8;color:#234C38;font-family:Arial,sans-serif;"><main style="max-width:560px;margin:72px auto;padding:36px;background:#FFFDF7;border-radius:24px;text-align:center;"><h1 style="margin:0 0 14px;font-family:Georgia,serif;">Leiratkozol a Momo levelekről?</h1><p style="line-height:1.6;color:#535C52;">Marketing- és életciklus e-mailt nem küldünk többé. A rendelésedhez és a fiókod biztonságához kapcsolódó fontos üzenetek ettől még megérkeznek.</p><form method="post" action="/email-preferences/unsubscribe?token=${safeToken}"><button type="submit" style="border:0;border-radius:999px;background:#F4748B;color:#fff;padding:14px 24px;font-size:15px;font-weight:700;cursor:pointer;">Igen, leiratkozom</button></form><a href="https://momomatcha.hu" style="display:inline-block;margin-top:18px;color:#234C38;font-weight:700;">Mégsem, vissza a webshophoz</a></main></body></html>`
}

async function unsubscribe(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Referrer-Policy", "no-referrer")
  res.setHeader("X-Robots-Tag", "noindex, nofollow")

  let email: string | null = null
  try {
    email = verifyEmailPreferenceToken(req.query.token)
  } catch {
    res.status(503).json({ message: "A leiratkozás átmenetileg nem érhető el." })
    return
  }

  if (!email) {
    res.status(400).json({ message: "Érvénytelen leiratkozási link." })
    return
  }

  await suppressMarketingEmail(req.scope, email)
}

// Human-visible unsubscribe link in the email footer.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Referrer-Policy", "no-referrer")
  res.setHeader("X-Robots-Tag", "noindex, nofollow")

  try {
    if (!verifyEmailPreferenceToken(req.query.token)) {
      res.status(400).json({ message: "Érvénytelen leiratkozási link." })
      return
    }
  } catch {
    res.status(503).json({ message: "A leiratkozás átmenetileg nem érhető el." })
    return
  }

  res
    .status(200)
    .type("html")
    .send(confirmationPage(String(req.query.token ?? "")))
}

// RFC 8058 one-click endpoint used by supporting inbox providers.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await unsubscribe(req, res)
  if (res.headersSent) return
  if (String(req.headers.accept ?? "").includes("text/html")) {
    res.status(200).type("html").send(successPage())
    return
  }
  res.status(200).json({ ok: true })
}
