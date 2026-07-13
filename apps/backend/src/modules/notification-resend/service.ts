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
// Email-compressed hero (public/images/email-hero.jpg in the storefront) —
// the full lifestyle PNG is ~365KB, too heavy for an inbox.
const HERO_URL = `${STORE_URL}/images/email-hero.jpg`
const CONTACT = "info@momomatcha.hu"

// Brand-adjacent, email-client-safe font stacks. Webfonts (Nunito/Quicksand)
// don't load in Gmail/Outlook; Trebuchet MS is the closest rounded sans that
// ships everywhere.
const FONT = "'Trebuchet MS',Verdana,Arial,Helvetica,sans-serif"

// Marketing-type templates get an opt-out footer + List-Unsubscribe header;
// transactional ones (receipts, resets) must not.
const MARKETING_TEMPLATES = new Set([
  "welcome",
  "review-request",
  "abandoned-cart",
])

// All customer-sourced values (names, product titles, pickup points) are
// interpolated into HTML — escape them so a title like `Matcha <3` can't
// break the markup.
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

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

// Pill CTA button (table-based so it renders in Outlook), with an optional
// plain-link fallback for clients that mangle buttons.
function button(url: string, label: string, withFallback = false) {
  const fallback = withFallback
    ? `<p style="font-size:12px;color:#aaa;margin:2px 0 0;word-break:break-all;">Ha a gomb nem működik, másold a böngésződbe: <a href="${esc(
        url
      )}" style="color:${MATCHA};">${esc(url)}</a></p>`
    : ""
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;">
    <tr><td style="border-radius:9999px;background:${ACCENT};">
      <a href="${esc(
        url
      )}" style="display:inline-block;padding:13px 34px;font-family:${FONT};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:9999px;">${esc(
        label
      )}</a>
    </td></tr></table>${fallback}`
}

// Branded, email-client-safe wrapper (tables + inline styles) with a hidden
// preheader for the inbox preview line.
function layout(bodyHtml: string, preheader = "", marketing = false) {
  const optOut = marketing
    ? `<br>Nem szeretnél több ilyen levelet? Írj nekünk a <a href="mailto:${CONTACT}?subject=Leiratkozas" style="color:${MATCHA};text-decoration:none;">${CONTACT}</a> címre, és leveszünk a listáról.`
    : ""
  return `<!DOCTYPE html>
<html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${CREAM};">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${esc(
    preheader
  )}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:28px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;">
        <tr><td align="center" style="padding:6px 0 22px;">
          <img src="${LOGO_URL}" width="84" height="84" alt="Momo Matcha" style="display:block;margin:0 auto;border-radius:16px;border:1px solid ${KRAFT};" />
          <div style="font-family:${FONT};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#A08D6E;margin-top:8px;">Rituálék a lassú élethez</div>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid ${KRAFT};border-radius:14px;padding:34px;font-family:${FONT};color:#3a3a3a;line-height:1.6;">
          ${bodyHtml}
        </td></tr>
        <tr><td align="center" style="padding:22px 14px;font-family:${FONT};font-size:12px;color:#9b9b9b;line-height:1.7;">
          <a href="${STORE_URL}" style="color:${MATCHA};text-decoration:none;">momomatcha.hu</a>
          &nbsp;·&nbsp;
          <a href="mailto:${CONTACT}" style="color:${MATCHA};text-decoration:none;">${CONTACT}</a>
          ${optOut}<br>
          © ${new Date().getFullYear()} Momo Matcha. Minden jog fenntartva.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function h1(text: string) {
  return `<h1 style="margin:0 0 8px;font-family:${FONT};font-size:24px;font-weight:700;color:${MATCHA};">${text}</h1>`
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

// "Label: value" info block (shipping method, pickup point, address).
function infoBlock(rows: Array<[string, string | null | undefined]>) {
  const filled = rows.filter(([, v]) => v)
  if (!filled.length) return ""
  const trs = filled
    .map(
      ([label, value]) => `<tr>
        <td style="padding:3px 12px 3px 0;font-size:13px;color:#999;white-space:nowrap;vertical-align:top;">${label}</td>
        <td style="padding:3px 0;font-size:13px;color:#555;">${esc(value)}</td>
      </tr>`
    )
    .join("")
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;background:#FAF7F0;border-radius:10px;"><tr><td style="padding:12px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0">${trs}</table>
  </td></tr></table>`
}

function itemRows(items: any[], cur?: string, withPrice = true) {
  return items
    .map((i: any) => {
      const line =
        typeof i.total === "number"
          ? i.total
          : typeof i.unit_price === "number"
          ? i.unit_price * (i.quantity ?? 1)
          : null
      const price = withPrice
        ? `<td style="padding:11px 0;border-bottom:1px solid #F0EBE0;font-size:14px;text-align:right;white-space:nowrap;">${
            line != null ? formatMoney(line, cur) : ""
          }</td>`
        : ""
      return `<tr>
        <td style="padding:11px 0;border-bottom:1px solid #F0EBE0;font-size:14px;">${esc(
          i.title
        )} <span style="color:#aaa;">× ${esc(i.quantity ?? 1)}</span></td>
        ${price}
      </tr>`
    })
    .join("")
}

// Per-template body. Falls back to a generic body for unknown templates.
function renderBody(template: string, data: Record<string, any>): string {
  const cur = data.currency_code

  switch (template) {
    case "order-confirmation": {
      const items = Array.isArray(data.items) ? data.items : []

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
        <p style="margin:0 0 22px;color:#666;">Visszaigazoltuk a <strong>#${esc(
          data.order_number
        )}</strong> számú rendelésed — hamarosan gondosan összekészítjük, és értesítünk, amint úton van.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRows(
          items,
          cur
        )}</table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">${summary}</table>
        <p style="font-size:12px;color:#aaa;margin:8px 0 0;">Az árak tartalmazzák az ÁFÁ-t.</p>
        ${infoBlock([
          ["Szállítás", data.shipping_method],
          ["Átvételi pont", data.pickup_point],
          ["Cím", data.shipping_address],
          ["Fizetés", data.payment_method],
        ])}
        ${button(`${STORE_URL}/hu/account`, "Rendeléseim megtekintése")}
        <p style="color:#666;font-size:13px;margin-top:12px;">Kérdésed van? Írj nekünk: <a href="mailto:${CONTACT}" style="color:${MATCHA};">${CONTACT}</a></p>`
    }

    case "shipping-confirmation":
      return `
        ${h1("Csomagod úton van! 📦")}
        <p style="color:#666;">A <strong>#${esc(
          data.order_number
        )}</strong> számú rendelésedet feladtuk, és már úton van hozzád. Jellemzően <strong>1–3 munkanapon</strong> belül megérkezik.</p>
        ${
          data.tracking_url
            ? button(data.tracking_url, "Csomag követése", true)
            : ""
        }
        <p style="color:#666;font-size:13px;margin-top:14px;">Bármi kérdés a szállítással kapcsolatban? Keress minket: <a href="mailto:${CONTACT}" style="color:${MATCHA};">${CONTACT}</a></p>`

    case "password-reset":
      return `
        ${h1("Jelszó visszaállítása")}
        <p style="color:#666;">Kérted a jelszavad visszaállítását. Kattints az alábbi gombra egy új jelszó beállításához. A link biztonsági okokból hamarosan lejár.</p>
        ${button(data.reset_url ?? "#", "Új jelszó beállítása", true)}
        <p style="color:#aaa;font-size:13px;margin-top:12px;">Ha nem te kérted, nyugodtan hagyd figyelmen kívül ezt az e-mailt — a jelszavad változatlan marad.</p>`

    case "admin-order-notification": {
      const items = Array.isArray(data.items) ? data.items : []
      return `
        ${h1(`Új rendelés érkezett! 🎉 #${esc(data.order_number)}`)}
        <p style="color:#666;margin:0 0 16px;">
          <strong>Vásárló:</strong> ${esc(data.customer_name)} (${esc(
            data.customer_email
          )})<br/>
          ${
            data.internal_order_number
              ? `<strong>Belső azonosító (admin):</strong> #${esc(
                  data.internal_order_number
                )}<br/>`
              : ""
          }
          <strong>Végösszeg:</strong> ${formatMoney(data.total, cur)}<br/>
          <strong>Szállítás:</strong> ${esc(data.shipping_method ?? "-")}<br/>
          ${
            data.pickup_point
              ? `<strong>Átvételi pont:</strong> ${esc(data.pickup_point)}<br/>`
              : ""
          }
          <strong>Fizetés:</strong> ${esc(data.payment_method ?? "-")}
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRows(
          items,
          cur,
          false
        )}</table>
        ${button(
          `https://admin.momomatcha.hu/app/orders/${data.order_id ?? ""}`,
          "Rendelés megnyitása az adminban"
        )}`
    }

    case "review-request": {
      const products = Array.isArray(data.products) ? data.products : []
      const links = products
        .map(
          (p: any) =>
            `<li style="margin:6px 0;"><a href="${esc(
              p.url
            )}" style="color:${MATCHA};font-weight:700;text-decoration:none;">${esc(
              p.title
            )}</a></li>`
        )
        .join("")
      return `
        ${h1("Hogy ízlett? 🍵")}
        <p style="color:#666;">Pár napja megérkezett a <strong>#${esc(
          data.order_number
        )}</strong> számú rendelésed — reméljük, már meg is találtad benne a saját rituálédat. Sokat segítenél nekünk (és a többi matcharajongónak), ha megosztanád pár szóban, hogy ízlett!</p>
        <ul style="color:#666;padding-left:18px;margin:14px 0;">${links}</ul>
        <p style="color:#666;font-size:13px;">A linkre kattintva a termékoldalon tudod leadni az értékelésed — 2 perc az egész.</p>
        ${products[0]?.url ? button(products[0].url, "Vélemény írása") : ""}`
    }

    case "abandoned-cart": {
      const items = Array.isArray(data.items) ? data.items : []
      return `
        ${h1("A kosarad még vár rád 🍵")}
        <p style="color:#666;">Úgy láttuk, félbehagytad a rendelésed — a matchád még a kosaradban pihen. Ha kérdésed van a termékekről vagy a szállításról, írj bátran, szívesen segítünk!</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRows(
          items,
          cur,
          false
        )}</table>
        ${button(data.cart_url ?? STORE_URL, "Rendelés befejezése")}
        <p style="color:#aaa;font-size:12px;margin-top:12px;">Tipp: 15 000 Ft feletti rendelésnél a szállítás ingyenes.</p>`
    }

    case "welcome":
      return `
        <img src="${HERO_URL}" alt="" width="100%" style="display:block;width:100%;border-radius:12px;margin:-10px 0 20px;" />
        ${h1(`Üdvözlünk${data.first_name ? `, ${esc(data.first_name)}` : ""}! 🌿`)}
        <p style="color:#666;">Örülünk, hogy csatlakoztál a Momo Matcha közösséghez. Fedezd fel prémium, bio matcháinkat Uji dombjairól — a klasszikus szertartásostól a gyümölcsös ízesítettekig —, és találd meg a saját reggeli rituáléd.</p>
        ${button(STORE_URL, "Irány a bolt")}`

    default:
      return `${h1(esc(data.subject ?? "Momo Matcha"))}<p style="color:#666;">${esc(
        data.message ?? ""
      )}</p>`
  }
}

// Plain-text alternative — improves spam scoring and serves text-only
// clients. Short: the key facts + the primary link.
function renderText(template: string, data: Record<string, any>): string {
  const cur = data.currency_code
  const foot = `\n\nmomomatcha.hu · ${CONTACT}`

  switch (template) {
    case "order-confirmation": {
      const items = (Array.isArray(data.items) ? data.items : [])
        .map((i: any) => ` - ${i.title ?? ""} × ${i.quantity ?? 1}`)
        .join("\n")
      return (
        `Köszönjük a rendelésed!\n\nVisszaigazoltuk a #${data.order_number} számú rendelésed.\n\n` +
        `${items}\n\nVégösszeg: ${formatMoney(data.total, cur)} (az árak tartalmazzák az ÁFÁ-t)\n` +
        (data.shipping_method ? `Szállítás: ${data.shipping_method}\n` : "") +
        (data.pickup_point ? `Átvételi pont: ${data.pickup_point}\n` : "") +
        `\nRendeléseid: ${STORE_URL}/hu/account` +
        foot
      )
    }
    case "shipping-confirmation":
      return (
        `Csomagod úton van!\n\nA #${data.order_number} számú rendelésedet feladtuk — jellemzően 1–3 munkanapon belül megérkezik.` +
        (data.tracking_url ? `\n\nCsomag követése: ${data.tracking_url}` : "") +
        foot
      )
    case "password-reset":
      return (
        `Jelszó visszaállítása\n\nÚj jelszó beállítása: ${
          data.reset_url ?? ""
        }\n\nHa nem te kérted, hagyd figyelmen kívül ezt az e-mailt.` + foot
      )
    case "review-request": {
      const links = (Array.isArray(data.products) ? data.products : [])
        .map((p: any) => ` - ${p.title}: ${p.url}`)
        .join("\n")
      return (
        `Hogy ízlett? Mondd el pár szóban!\n\nA #${data.order_number} rendelésed termékei:\n${links}` +
        foot
      )
    }
    case "abandoned-cart":
      return (
        `A kosarad még vár rád.\n\nRendelés befejezése: ${
          data.cart_url ?? STORE_URL
        }\n\nTipp: 15 000 Ft felett ingyenes a szállítás.` + foot
      )
    case "welcome":
      return (
        `Üdvözlünk a Momo Matcha közösségben!\n\nFedezd fel a matcháinkat: ${STORE_URL}` +
        foot
      )
    default:
      return `${data.subject ?? "Momo Matcha"}\n\n${data.message ?? ""}` + foot
  }
}

// Exported for previewing/testing templates without sending.
export { layout as renderEmailLayout, renderBody as renderEmailBody, renderText as renderEmailText }

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
    const template = notification.template ?? ""
    const marketing = MARKETING_TEMPLATES.has(template)
    const subject =
      (data.subject as string) || notification.template || "Momo Matcha"
    const html =
      notification.content?.html ||
      layout(renderBody(template, data), subject, marketing)
    const text = notification.content?.text || renderText(template, data)
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
        body: JSON.stringify({
          from,
          to: notification.to,
          subject,
          html,
          text,
          // Gmail/Yahoo bulk-sender requirement for promotional mail.
          ...(marketing
            ? {
                headers: {
                  "List-Unsubscribe": `<mailto:${CONTACT}?subject=Leiratkozas>`,
                },
              }
            : {}),
        }),
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
