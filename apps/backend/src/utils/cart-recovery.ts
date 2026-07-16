import crypto from "node:crypto"

const DEFAULT_STOREFRONT_URL = "https://momomatcha.hu"
const TOKEN_TTL_HOURS = 72

function cartRecoverySecret(): string {
  const secret = process.env.CART_RECOVERY_SECRET || ""

  if (!secret) {
    throw new Error(
      "CART_RECOVERY_SECRET is required for signed abandoned-cart links."
    )
  }

  return secret
}

export function createCartRecoveryToken(cartId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      cart_id: cartId,
      expires_at: Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000,
      version: 1,
    }),
    "utf8"
  ).toString("base64url")
  const signature = crypto
    .createHmac("sha256", cartRecoverySecret())
    .update(payload)
    .digest("base64url")

  return `${payload}.${signature}`
}

export function createCartRecoveryUrl(cartId: string): string {
  const storefrontUrl =
    process.env.STOREFRONT_URL || DEFAULT_STOREFRONT_URL
  const url = new URL("/api/cart/recover", storefrontUrl)
  url.searchParams.set("token", createCartRecoveryToken(cartId))
  return url.toString()
}
