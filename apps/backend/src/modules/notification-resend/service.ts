import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
import { Logger } from "@medusajs/framework/types"
import type {
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"

type ResendOptions = {
  apiKey?: string
  from?: string
}

type InjectedDependencies = {
  logger: Logger
}

// Brand palette (matches the storefront's warm genZ rebrand)
const MATCHA = "#7C9B5E"
const ACCENT = "#E06B85"
const CREAM = "#F1EDE4"
const KRAFT = "#E3D6C4"
const STORE_URL = "https://momomatcha.hu"
const LOGO_URL = `${STORE_URL}/images/logo.jpg`
const LIFESTYLE_URL = `${STORE_URL}/images/lifestyle-drinking.png`

function formatMoney(amount: number, currency?: string) {
  try {
    return new Intl.NumberFormat("hu-HU", {
      style: "currency",
      currency: (currency || "HUF").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount ?? 0)
  } catch {
    return `${Math.round(amount ?? 0)} ${(currency || "").toUpperCase()}`
  }
}

// Pill CTA button (table-based so it renders in Outlook).
function button(url: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;">
    <tr><td style="border-radius:9999px;background:${ACCENT};">
      <a href="${url}" style="display:inline-block;padding:13px 34px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:9999px;">${label}</a>
    </td></tr></table>`
}

// Branded, email-client-safe wrapper (tables + inline styles) with a hidden
// preheader for the inbox preview line.
function layout(bodyHtml: string, preheader = "") {
  return `<!DOCTYPE html>
<html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${CREAM};">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:28px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;">
        <tr><td align="center" style="padding:6px 0 22px;">
          <img src="${LOGO_URL}" width="84" height="84" alt="Momo Matcha" style="display:block;margin:0 auto;border-radius:16px;border:1px solid ${KRAFT};" />
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#A08D6E;margin-top:8px;">Rituálék a lassú élethez</div>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid ${KRAFT};border-radius:14px;padding:34px;font-family:Arial,Helvetica,sans-serif;color:#3a3a3a;line-height:1.6;">
          ${bodyHtml}
        </td></tr>
        <tr><td align="center" style="padding:22px 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9b9b9b;line-height:1.7;">
          <a href="${STORE_URL}" style="color:${MATCHA};text-decoration:none;">momomatcha.hu</a>
          &nbsp;·&nbsp;
          <a href="mailto:info@momomatcha.hu" style="color:${MATCHA};text-decoration:none;">info@momomatcha.hu</a><br>
          © ${new Date().getFullYear()} Momo Matcha. Minden jog fenntartva.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function h1(text: string) {
  return `<h1 style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:${MATCHA};">${text}</h1>`
}

function summaryRow(label: string, value: string, bold = false) {
  const strong = bold
    ? `font-weight:700;color:${MATCHA};font-size:16px;`
    : "color:#666;"
  return `<tr>
    <td style="padding:4px 0;font-size:14px;color:#666;">${label}</td>
    <td style="padding:4px 0;font-size:14px;text-align:right;${strong}">${value}</td>
  </tr>`
}

// Per-template body. Falls back to a generic body for unknown templates.
function renderBody(template: string, data: Record<string, any>): string {
  const cur = data.currency_code

  switch (template) {
    case "order-confirmation": {
      const items = Array.isArray(data.items) ? data.items : []
      const rows = items
        .map((i: any) => {
          const line =
            typeof i.total === "number"
              ? i.total
              : typeof i.unit_price === "number"
              ? i.unit_price * (i.quantity ?? 1)
              : null
          return `<tr>
            <td style="padding:11px 0;border-bottom:1px solid #F0EBE0;font-size:14px;">${i.title ?? ""} <span style="color:#aaa;">× ${i.quantity ?? 1}</span></td>
            <td style="padding:11px 0;border-bottom:1px solid #F0EBE0;font-size:14px;text-align:right;white-space:nowrap;">${line != null ? formatMoney(line, cur) : ""}</td>
          </tr>`
        })
        .join("")

      const shippingText =
        typeof data.shipping_total === "number" && data.shipping_total === 0
          ? "Ingyenes"
          : typeof data.shipping_total === "number"
          ? formatMoney(data.shipping_total, cur)
          : null

      const summary = [
        typeof data.subtotal === "number"
          ? summaryRow("Részösszeg", formatMoney(data.subtotal, cur))
          : "",
        shippingText ? summaryRow("Szállítás", shippingText) : "",
        typeof data.discount_total === "number" && data.discount_total > 0
          ? summaryRow("Kedvezmény", "-" + formatMoney(data.discount_total, cur))
          : "",
        `<tr><td colspan="2" style="border-top:2px solid ${KRAFT};padding-top:6px;"></td></tr>`,
        summaryRow("Végösszeg", formatMoney(data.total, cur), true),
      ].join("")

      return `
        ${h1("Köszönjük a rendelésed! 🍵")}
        <p style="margin:0 0 22px;color:#666;">Visszaigazoltuk a <strong>#${data.order_number}</strong> számú rendelésed — hamarosan gondosan összekészítjük, és értesítünk, amint úton van.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">${summary}</table>
        <p style="font-size:12px;color:#aaa;margin:8px 0 0;">Az árak tartalmazzák az ÁFÁ-t.</p>
        ${button(`${STORE_URL}/hu/account`, "Rendeléseim megtekintése")}
        <p style="color:#666;font-size:13px;margin-top:12px;">Kérdésed van? Írj nekünk: <a href="mailto:info@momomatcha.hu" style="color:${MATCHA};">info@momomatcha.hu</a></p>`
    }

    case "shipping-confirmation":
      return `
        ${h1("Csomagod úton van! 📦")}
        <p style="color:#666;">A <strong>#${data.order_number}</strong> számú rendelésedet feladtuk, és már úton van hozzád. Jellemzően <strong>1–3 munkanapon</strong> belül megérkezik.</p>
        ${data.tracking_url ? button(data.tracking_url, "Csomag követése") : ""}
        <p style="color:#666;font-size:13px;margin-top:14px;">Bármi kérdés a szállítással kapcsolatban? Keress minket: <a href="mailto:info@momomatcha.hu" style="color:${MATCHA};">info@momomatcha.hu</a></p>`

    case "password-reset":
      return `
        ${h1("Jelszó visszaállítása")}
        <p style="color:#666;">Kérted a jelszavad visszaállítását. Kattints az alábbi gombra egy új jelszó beállításához. A link biztonsági okokból hamarosan lejár.</p>
        ${button(data.reset_url ?? "#", "Új jelszó beállítása")}
        <p style="color:#aaa;font-size:13px;margin-top:12px;">Ha nem te kérted, nyugodtan hagyd figyelmen kívül ezt az e-mailt — a jelszavad változatlan marad.</p>`

    case "welcome":
      return `
        <img src="${LIFESTYLE_URL}" alt="" width="100%" style="display:block;width:100%;border-radius:12px;margin:-10px 0 20px;" />
        ${h1(`Üdvözlünk, ${data.first_name ?? ""}! 🌿`)}
        <p style="color:#666;">Örülünk, hogy csatlakoztál a Momo Matcha közösséghez. Fedezd fel prémium, bio matcháinkat Uji dombjairól — a klasszikus szertartásostól a gyümölcsös ízesítettekig —, és találd meg a saját reggeli rituáléd.</p>
        ${button(STORE_URL, "Irány a bolt")}`

    default:
      return `${h1(data.subject ?? "Momo Matcha")}<p style="color:#666;">${data.message ?? ""}</p>`
  }
}

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "resend"

  protected logger_: Logger
  protected options_: ResendOptions

  constructor({ logger }: InjectedDependencies, options: ResendOptions) {
    super()
    this.logger_ = logger
    this.options_ = options
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const data = (notification.data ?? {}) as Record<string, any>
    const subject =
      (data.subject as string) || notification.template || "Momo Matcha"
    const html =
      notification.content?.html ||
      layout(renderBody(notification.template ?? "", data), subject)
    const from =
      notification.from ||
      this.options_.from ||
      "Momo Matcha <onboarding@resend.dev>"

    // No API key (e.g. local dev): log instead of sending, so nothing breaks.
    if (!this.options_.apiKey) {
      this.logger_.info(
        `[resend] (no API key — not sent) to=${notification.to} subject="${subject}"`
      )
      return {}
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options_.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: notification.to, subject, html }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        this.logger_.error(
          `[resend] send failed (${res.status}): ${JSON.stringify(body)}`
        )
        throw new Error(`Resend send failed: ${res.status}`)
      }

      this.logger_.info(`[resend] sent to=${notification.to} id=${body?.id}`)
      return { id: body?.id }
    } catch (e: any) {
      this.logger_.error(
        `[resend] error sending to ${notification.to}: ${e?.message}`
      )
      throw e
    }
  }
}

export default ResendNotificationProviderService
