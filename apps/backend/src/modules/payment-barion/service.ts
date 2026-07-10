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

type BarionOptions = {
  posKey: string
  environment: "test" | "prod"
  // Barion requires Transactions[].Payee: the merchant wallet's email address.
  payeeEmail?: string
  fundingSources?: string[]
  locale?: string
}

type InjectedDependencies = {
  logger: Logger
}

// https://docs.barion.com/Payment-Start-v2 / Payment-GetPaymentState-v2 / Payment-Capture-v2 / Payment-Refund-v2
const BARION_STATUS_MAP: Record<string, GetPaymentStatusOutput["status"]> = {
  Prepared: "pending",
  Started: "pending",
  InProgress: "pending",
  Reserved: "authorized",
  Authorized: "authorized",
  Succeeded: "captured",
  Canceled: "canceled",
  Expired: "canceled",
  Failed: "error",
}

class BarionProviderService extends AbstractPaymentProvider<BarionOptions> {
  static identifier = "barion"

  protected logger_: Logger
  protected options_: BarionOptions
  protected baseUrl_: string

  static validateOptions(options: Record<string, unknown>) {
    if (!options.posKey) {
      // eslint-disable-next-line no-console
      console.warn(
        "[Barion] No `posKey` configured - the provider is registered but will error if used until BARION_POS_KEY is set."
      )
    }
  }

  constructor(cradle: InjectedDependencies, options: BarionOptions) {
    super(cradle, options)

    this.logger_ = cradle.logger
    this.options_ = options
    this.baseUrl_ =
      options.environment === "prod"
        ? "https://api.barion.com"
        : "https://api.test.barion.com"
  }

  private async callBarion(path: string, body: Record<string, unknown>) {
    const response = await fetch(`${this.baseUrl_}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ POSKey: this.options_.posKey, ...body }),
    })

    const json = await response.json()

    if (!response.ok || json.Errors?.length) {
      this.logger_.error(`[Barion] Request to ${path} failed: ${JSON.stringify(json)}`)
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Barion request failed: ${json.Errors?.[0]?.Title ?? response.statusText}`
      )
    }

    return json
  }

  private async getPaymentState(paymentId: string) {
    const response = await fetch(
      `${this.baseUrl_}/v2/Payment/GetPaymentState?POSKey=${encodeURIComponent(
        this.options_.posKey
      )}&PaymentId=${encodeURIComponent(paymentId)}`
    )
    const json = await response.json()

    // Without this check a Barion API error came back as `Status: undefined`
    // and was silently mapped to "pending".
    if (!response.ok || json.Errors?.length) {
      this.logger_.error(
        `[Barion] GetPaymentState for ${paymentId} failed: ${JSON.stringify(json)}`
      )
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Barion GetPaymentState failed: ${json.Errors?.[0]?.Title ?? response.statusText}`
      )
    }

    return json
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const { amount, currency_code, context } = input
    const sessionId = context?.idempotency_key ?? ""

    const payload = {
      PaymentType: "Immediate",
      GuestCheckOut: true,
      FundingSources: this.options_.fundingSources ?? ["All"],
      Locale: this.options_.locale ?? "hu-HU",
      Currency: currency_code.toUpperCase(),
      PaymentRequestId: `${sessionId}-${Date.now()}`,
      RedirectUrl:
        (context as any)?.barion_redirect_url ??
        `${process.env.STOREFRONT_URL}/hu/checkout/payment-return`,
      CallbackUrl:
        (context as any)?.barion_callback_url ??
        `${process.env.MEDUSA_BACKEND_URL}/hooks/payment/barion_barion`,
      Transactions: [
        {
          POSTransactionId: sessionId,
          Payee: (context as any)?.barion_payee_email ?? this.options_.payeeEmail,
          Total: Number(amount),
        },
      ],
    }

    const data = await this.callBarion("/v2/Payment/Start", payload)

    return {
      id: data.PaymentId,
      data: {
        payment_id: data.PaymentId,
        gateway_url: data.GatewayUrl,
        status: data.Status,
        session_id: sessionId,
      },
    }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const paymentId = (input.data?.payment_id ?? input.data?.id) as string
    const state = await this.getPaymentState(paymentId)
    const status = BARION_STATUS_MAP[state.Status] ?? "pending"

    return {
      status: status === "captured" ? "authorized" : status,
      data: { ...input.data, barion_status: state.Status },
    }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    // Payments are created with PaymentType "Immediate", so Barion settles them
    // automatically on success - there's nothing further to capture.
    return { data: input.data }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    this.logger_.warn(
      "[Barion] cancelPayment called - Immediate payments cannot be voided pre-settlement via the API; use refundPayment once captured."
    )
    return { data: input.data }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const paymentId = (input.data?.payment_id ?? input.data?.id) as string
    if (!paymentId) {
      return { status: "pending" }
    }
    const state = await this.getPaymentState(paymentId)
    return {
      status: BARION_STATUS_MAP[state.Status] ?? "pending",
      data: { ...input.data, barion_status: state.Status },
    }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const paymentId = (input.data?.payment_id ?? input.data?.id) as string
    const state = await this.getPaymentState(paymentId)
    const transactionId = state.Transactions?.[0]?.TransactionId

    await this.callBarion("/v2/Payment/Refund", {
      PaymentId: paymentId,
      TransactionsToRefund: [
        {
          TransactionId: transactionId,
          POSTransactionId: state.Transactions?.[0]?.POSTransactionId,
          AmountToRefund: Number(input.amount),
        },
      ],
    })

    return { data: input.data }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    const paymentId = (input.data?.payment_id ?? input.data?.id) as string
    return this.getPaymentState(paymentId)
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // Barion doesn't support mutating an already-started payment's amount.
    return { data: input.data }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const { data } = payload
    const paymentId = (data as any)?.PaymentId as string

    if (!paymentId) {
      return { action: "not_supported" }
    }

    // Never trust the callback body alone - re-fetch the authoritative state from Barion.
    const state = await this.getPaymentState(paymentId)
    const sessionId = state.Transactions?.[0]?.POSTransactionId
    const amount = new BigNumber(state.Transactions?.[0]?.Total ?? 0)

    switch (state.Status) {
      case "Succeeded":
        return { action: "captured", data: { session_id: sessionId, amount } }
      case "Reserved":
      case "Authorized":
        return { action: "authorized", data: { session_id: sessionId, amount } }
      case "Failed":
      case "Expired":
      case "Canceled":
        return { action: "failed", data: { session_id: sessionId, amount } }
      default:
        return { action: "not_supported" }
    }
  }
}

export default BarionProviderService
