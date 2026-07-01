import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils"
import { Logger } from "@medusajs/framework/types"
import {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceContext,
  CreateFulfillmentResult,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  ValidateFulfillmentDataContext,
} from "@medusajs/types"

// FoxPost is locker/APM-based - the storefront must show FoxPost's locker-picker widget at
// checkout and pass the chosen locker id through as `data.destination` (e.g. "hu35"). Field
// names below are confirmed against FoxPost's live OpenAPI spec at
// https://webapi.foxpost.hu/v3/api-docs (POST /api/parcel, POST /api/label/{pageSize}).
// Note: no confirmed public cancel-parcel endpoint was found - cancellation may need to be
// done via the FoxPost WebAdmin portal until confirmed otherwise with FoxPost support.
type FoxpostOptions = {
  apiKey: string
  environment: "test" | "prod"
}

type InjectedDependencies = {
  logger: Logger
}

class FoxpostFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "foxpost"

  protected logger_: Logger
  protected options_: FoxpostOptions
  protected baseUrl_: string

  constructor(cradle: InjectedDependencies, options: FoxpostOptions) {
    super()
    this.logger_ = cradle.logger
    this.options_ = options
    this.baseUrl_ = "https://webapi.foxpost.hu/api"
  }

  private async call(path: string, body: unknown) {
    const response = await fetch(`${this.baseUrl_}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.options_.apiKey,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`FoxPost ${path} failed (${response.status}): ${text}`)
    }
    return response.json()
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [{ id: "foxpost-apm", name: "FoxPost csomagautomata" }]
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: ValidateFulfillmentDataContext
  ) {
    if (!data.destination) {
      throw new Error(
        "A FoxPost csomagautomata kiválasztása kötelező (missing `destination` locker id)."
      )
    }
    return data
  }

  async validateOption(): Promise<boolean> {
    return true
  }

  async canCalculate(): Promise<boolean> {
    return false
  }

  async calculatePrice(): Promise<CalculatedShippingOptionPrice> {
    throw new Error("FoxPost uses flat-rate shipping options, not calculated pricing.")
  }

  async createFulfillment(
    data: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    fulfillment: Record<string, unknown>
  ): Promise<CreateFulfillmentResult> {
    const address = order?.shipping_address as any

    const [parcel] = await this.call("/parcel", [
      {
        recipientName: `${address?.first_name ?? ""} ${address?.last_name ?? ""}`.trim(),
        recipientEmail: order?.email,
        recipientPhone: address?.phone,
        destination: data.destination,
        size: "m",
        refCode: order?.display_id?.toString(),
      },
    ])

    return {
      data: {
        ...(fulfillment.data as object),
        foxpost_barcode: parcel?.barcode ?? parcel?.uniqueBarcode,
      },
    }
  }

  async cancelFulfillment(data: Record<string, unknown>) {
    this.logger_.warn(
      `[FoxPost] cancelFulfillment called for barcode ${data.foxpost_barcode} - no confirmed public cancel API; cancel manually via the FoxPost WebAdmin portal.`
    )
    return { data }
  }

  async getFulfillmentDocuments(data: Record<string, unknown>) {
    const barcode = data.foxpost_barcode as string
    if (!barcode) return []

    const response = await fetch(`${this.baseUrl_}/label/A6?startPos=0`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": this.options_.apiKey },
      body: JSON.stringify([barcode]),
    })
    const pdfBuffer = Buffer.from(await response.arrayBuffer())
    return [{ base_64: pdfBuffer.toString("base64"), type: "application/pdf" }] as any
  }

  async createReturnFulfillment(fulfillment: Record<string, unknown>): Promise<CreateFulfillmentResult> {
    return { data: fulfillment.data as object }
  }

  async getReturnDocuments() {
    return []
  }

  async getShipmentDocuments() {
    return []
  }

  async retrieveDocuments() {
    return undefined as any
  }
}

export default FoxpostFulfillmentService
