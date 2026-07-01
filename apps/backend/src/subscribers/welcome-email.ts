import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function welcomeEmailHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)

  const { data: customers } = await query.graph({
    entity: "customer",
    filters: { id: data.id },
    fields: ["id", "email", "first_name", "has_account"],
  })
  const customer = customers[0]
  if (!customer?.has_account || !customer.email) return

  await notificationModuleService.createNotifications({
    to: customer.email,
    channel: "email",
    template: "welcome",
    data: {
      subject: "Üdvözlünk a Momo Matcha közösségben!",
      first_name: customer.first_name,
    },
  })
}

export const config: SubscriberConfig = {
  event: "customer.created",
}
