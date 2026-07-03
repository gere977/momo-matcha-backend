import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createCustomerAccountWorkflow } from "@medusajs/medusa/core-flows";

// gere977@gmail.com already has an emailpass auth identity (from the admin
// user), so store registration is rejected as "already exists" — but no
// customer is linked, so store login authenticates yet has nothing to log into.
// This attaches a customer profile to that same identity, so the SAME email +
// the SAME (admin) password works on the storefront too.
const EMAIL = "gere977@gmail.com";

export default async function link_customer({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const authService = container.resolve(Modules.AUTH);
  const customerService = container.resolve(Modules.CUSTOMER);

  const existing = await customerService.listCustomers({ email: EMAIL });
  if (existing.some((c: any) => c.has_account)) {
    logger.info(`A registered customer already exists for ${EMAIL}.`);
    return;
  }

  const authIdentities = await authService.listAuthIdentities(
    {},
    { relations: ["provider_identities"] }
  );
  const identity = authIdentities.find((ai: any) =>
    (ai.provider_identities ?? []).some(
      (pi: any) => pi.entity_id === EMAIL && pi.provider === "emailpass"
    )
  );
  if (!identity) {
    logger.error(`No emailpass auth identity found for ${EMAIL}.`);
    return;
  }

  await createCustomerAccountWorkflow(container).run({
    input: {
      authIdentityId: identity.id,
      customerData: { email: EMAIL, first_name: "Viktor", last_name: "Gere" },
    },
  });
  logger.info(
    `Linked a customer account to ${EMAIL} — log in on the store with your admin password.`
  );
}
