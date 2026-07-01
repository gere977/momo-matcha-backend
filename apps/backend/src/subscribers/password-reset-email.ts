import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

export default async function passwordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<{ entity_id: string; actor_type: string; token: string }>) {
  // Only customer-facing resets get an email here - admin/user password resets are a
  // separate concern handled through the admin dashboard's own flow.
  if (data.actor_type !== "customer") return

  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const storefrontUrl = process.env.STOREFRONT_URL ?? "http://localhost:8000"
  const resetUrl = `${storefrontUrl}/hu/account/reset-password?token=${data.token}&email=${encodeURIComponent(
    data.entity_id
  )}`

  await notificationModuleService.createNotifications({
    to: data.entity_id,
    channel: "email",
    template: "password-reset",
    data: {
      subject: "Jelszó visszaállítása - Momo Matcha",
      reset_url: resetUrl,
    },
  })
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
