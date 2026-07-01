import crypto from "crypto"
import { AbstractPaymentProvider, MedusaError, BigNumber } from "@medusajs/framework/utils"
import { Logger } from "@medusajs/framework/types"
import {
  CapturePaymentInput,
  CapturePaymentOutput,
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  ProviderWebhookPayload,
  WebhookActionResult,
} from "@medusajs/framework/types"

// NOTE: SimplePay (OTP) issues one secret key PER CURRENCY on the merchant account.
// Field names below follow SimplePay's public v2 API documentation
// (https://simplepartner.hu/download.php?target=v21docen) - double check the exact
// spelling against your merchant technical PDF from OTP once you have sandbox access,
// as SimplePay does not publish the full spec on a crawlable page.
type SimplePayOptions = {
  merchantId: string
  secretKeys: Record<string, string> // e.g. { HUF: "...", EUR: "..." }
  environment: "sandbox" | "prod"
  language?: string
}

type InjectedDependencies = {
  logger: Logger
}

class SimplePayProviderService extends AbstractPaymentProvider<SimplePayOptions> {
  static identifier = "simplepay"

  protected logger_: Logger
  protected options_: SimplePayOptions
  protected baseUrl_: string

  static validateOptions(options: Record<string, unknown>) {
    if (!options.merchantId || !options.secretKeys) {
      // eslint-disable-next-line no-console
      console.warn(
        "[SimplePay] No `merchantId`/`secretKeys` configured - the provider is registered but will error if used until SIMPLEPAY_MERCHANT_ID/SIMPLEPAY_SECRET_KEY_HUF are set."
      )
    }
  }

  constructor(cradle: InjectedDependencies, options: SimplePayOptions) {
    super(cradle, options)

    this.logger_ = cradle.logger
    this.options_ = options
    this.baseUrl_ =
      options.environment === "prod"
        ? "https://secure.simplepay.hu/payment/v2"
        : "https://sandbox.simplepay.hu/payment/v2"
  }

  private secretFor(currency: string) {
    const key = this.options_.secretKeys[currency.toUpperCase()]
    if (!key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `No SimplePay secret key configured for currency ${currency}`
      )
    }
    return key
  }

  private sign(rawBody: string, secret: string) {
    return crypto.createHmac("sha384", secret).update(rawBody, "utf8").digest("base64")
  }

  /** Verifies an incoming request/IPN's Signature header against its raw body. */
  verifySignature(rawBody: string, signatureHeader: string, currency: string) {
    const expected = this.sign(rawBody, this.secretFor(currency))
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader ?? ""))
  }

  private async callSimplePay(path: string, currency: string, body: Record<string, unknown>) {
    const fullBody = {
      salt: crypto.randomBytes(16).toString("hex"),
      merchant: this.options_.merchantId,
      sdkVersion: "medusa-momomatcha-1.0",
      ...body,
    }
    const rawBody = JSON.stringify(fullBody)
    const signature = this.sign(rawBody, this.secretFor(currency))

    const response = await fetch(`${this.baseUrl_}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Signature: signature },
      body: rawBody,
    })

    const json = await response.json()

    if (!response.ok || json.errorCodes?.length) {
      this.logger_.error(`[SimplePay] Request to ${path} failed: ${JSON.stringify(json)}`)
      throw new MedusaError(
        MedusaError.Types.PAYMENT_ERROR,
        `SimplePay request failed: ${json.errorCodes?.join(", ") ?? response.statusText}`
      )
    }

    return json
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const { amount, currency_code, context } = input
    const sessionId = context?.session_id ?? context?.resource_id ?? ""
    const currency = currency_code.toUpperCase()

    const data = await this.callSimplePay("/start", currency, {
      orderRef: sessionId,
      currency,
      customerEmail: (context as any)?.simplepay_customer_email ?? "guest@momomatcha.hu",
      language: this.options_.language ?? "HU",
      methods: ["CARD"],
      total: Number(amount),
      timeout: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      url: (context as any)?.simplepay_redirect_url,
    })

    return {
      id: data.transactionId,
      data: {
        transaction_id: data.transactionId,
        payment_url: data.paymentUrl,
        order_ref: sessionId,
        currency,
        session_id: sessionId,
      },
    }
  }

  private async queryStatus(orderRef: string, currency: string) {
    return this.callSimplePay("/query", currency, { orderRefs: [orderRef] })
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const { order_ref, currency } = input.data as any
    const result = await this.queryStatus(order_ref, currency)
    const status = result.transactions?.[0]?.status

    return {
      status: status === "FINISHED" ? "authorized" : "pending",
      data: { ...input.data, simplepay_status: status },
    }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    // Standard SimplePay CARD flow settles on FINISHED status - nothing further to capture.
    return { data: input.data }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const { order_ref, currency } = (input.data ?? {}) as any
    if (!order_ref) {
      return { status: "pending" }
    }
    const result = await this.queryStatus(order_ref, currency)
    const status = result.transactions?.[0]?.status

    const map: Record<string, GetPaymentStatusOutput["status"]> = {
      FINISHED: "captured",
      CANCELLED: "canceled",
      TIMEOUT: "canceled",
      FRAUD: "error",
    }

    return {
      status: map[status] ?? "pending",
      data: { ...input.data, simplepay_status: status },
    }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const { order_ref, currency, transaction_id } = input.data as any

    await this.callSimplePay("/refund", currency, {
      orderRef: order_ref,
      transactionId: transaction_id,
      currency,
      refundTotal: Number(input.amount),
    })

    return { data: input.data }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    const { order_ref, currency } = input.data as any
    return this.queryStatus(order_ref, currency)
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: input.data }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    // The custom /webhooks/simplepay route already verifies the Signature header
    // and re-queries SimplePay for authoritative status before emitting this event -
    // see src/api/webhooks/simplepay/route.ts.
    const { data } = payload as any
    const sessionId = data?.orderRef
    const amount = new BigNumber(data?.total ?? 0)

    switch (data?.status) {
      case "FINISHED":
        return { action: "captured", data: { session_id: sessionId, amount } }
      case "CANCELLED":
      case "TIMEOUT":
      case "FRAUD":
        return { action: "failed", data: { session_id: sessionId, amount } }
      default:
        return { action: "not_supported" }
    }
  }
}

export default SimplePayProviderService
