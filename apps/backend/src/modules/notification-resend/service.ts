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

const MATCHA = "#6A8D53"
const ACCENT = "#D94E41"

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

// Branded wrapper so every email looks like Momo Matcha regardless of template.
function layout(bodyHtml: string) {
  return `<!DOCTYPE html>
<html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F9F7F2;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#333;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;padding-bottom:24px;border-bottom:2px solid ${MATCHA};">
      <span style="font-size:28px;font-weight:700;color:${MATCHA};letter-spacing:.5px;">Momo Matcha</span>
    </div>
    <div style="background:#fff;border:1px solid #E3D6C4;border-radius:12px;padding:28px;margin-top:24px;line-height:1.6;">
      ${bodyHtml}
    </div>
    <p style="text-align:center;color:#aaa;font-size:12px;margin-top:24px;">
      © ${new Date().getFullYear()} Momo Matcha · momomatcha.hu
    </p>
  </div>
</body></html>`
}

function button(url: string, label: string) {
  return `<a href="${url}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:9999px;margin-top:8px;">${label}</a>`
}

// Render the email body for each known template; falls back to a generic body.
function renderBody(template: string, data: Record<string, any>): string {
  switch (template) {
    case "order-confirmation": {
      const items = Array.isArray(data.items) ? data.items : []
      const rows = items
        .map(
          (i: any) =>
            `<tr><td style="padding:6px 0;">${i.title ?? ""}</td><td style="padding:6px 0;text-align:right;">×${i.quantity ?? 1}</td></tr>`
        )
        .join("")
      return `
        <h2 style="margin-top:0;color:${MATCHA};">Köszönjük a rendelésed! 🍵</h2>
        <p>Visszaigazoltuk a <strong>#${data.order_number}</strong> számú rendelésed. Hamarosan összekészítjük.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">${rows}</table>
        <p style="font-size:16px;"><strong>Végösszeg: ${formatMoney(data.total, data.currency_code)}</strong></p>`
    }
    case "shipping-confirmation":
      return `
        <h2 style="margin-top:0;color:${MATCHA};">Csomagod úton van! 📦</h2>
        <p>A <strong>#${data.order_number}</strong> számú rendelésedet feladtuk. Hamarosan megérkezik hozzád.</p>
        ${data.tracking_url ? `<p>${button(data.tracking_url, "Csomag követése")}</p>` : ""}`
    case "password-reset":
      return `
        <h2 style="margin-top:0;color:${MATCHA};">Jelszó visszaállítása</h2>
        <p>Kérted a jelszavad visszaállítását. Kattints az alábbi gombra egy új jelszó beállításához. Ha nem te kérted, hagyd figyelmen kívül ezt az e-mailt.</p>
        <p>${button(data.reset_url ?? "#", "Új jelszó beállítása")}</p>`
    case "welcome":
      return `
        <h2 style="margin-top:0;color:${MATCHA};">Üdvözlünk, ${data.first_name ?? ""}! 🌿</h2>
        <p>Örülünk, hogy csatlakoztál a Momo Matcha közösséghez. Fedezd fel prémium, bio ceremoniális matcháinkat, és találd meg a saját rituáléd.</p>
        <p>${button("https://momomatcha.hu", "Irány a bolt")}</p>`
    default:
      return `<p>${data.message ?? data.subject ?? ""}</p>`
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
    const html = notification.content?.html || layout(renderBody(notification.template ?? "", data))
    const from =
      notification.from || this.options_.from || "Momo Matcha <onboarding@resend.dev>"

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
      this.logger_.error(`[resend] error sending to ${notification.to}: ${e?.message}`)
      throw e
    }
  }
}

export default ResendNotificationProviderService
