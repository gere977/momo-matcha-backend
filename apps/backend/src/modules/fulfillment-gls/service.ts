import crypto from "crypto"
import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils"
import { Logger } from "@medusajs/framework/types"
import {
  CalculatedShippingOptionPrice,
  CreateFulfillmentResult,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  ValidateFulfillmentDataContext,
} from "@medusajs/types"

// Standard GLS door delivery, no locker-picker needed (unlike FoxPost). Field names and
// auth scheme confirmed against the MyGLS API's public documentation and reference PHP SDK
// (github.com/digicode-kft/mygls-sdk): the Password field is the SHA-512 digest of the
// password sent as a JSON array of raw bytes, not a hex string.
type GlsOptions = {
  username: string
  password: string
  clientNumber: string
  environment: "test" | "prod"
  pickupAddress: {
    name: string
    street: string
    houseNumber: string
    city: string
    zipCode: string
    countryIsoCode: string
    contactEmail: string
    contactPhone: string
  }
}

type InjectedDependencies = {
  logger: Logger
}

class GlsFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "gls"

  protected logger_: Logger
  protected options_: GlsOptions
  protected baseUrl_: string

  constructor(cradle: InjectedDependencies, options: GlsOptions) {
    super()
    this.logger_ = cradle.logger
    this.options_ = options
    this.baseUrl_ =
      options.environment === "prod"
        ? "https://api.mygls.hu/ParcelService.svc/json"
        : "https://api.test.mygls.hu/ParcelService.svc/json"
  }

  private passwordBytes() {
    return Array.from(crypto.createHash("sha512").update(this.options_.password, "utf8").digest())
  }

  private async call(path: string, body: Record<string, unknown>) {
    const response = await fetch(`${this.baseUrl_}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Username: this.options_.username,
        Password: this.passwordBytes(),
        ...body,
      }),
    })
    const json = await response.json()
    if (!response.ok || json?.PrintLabelsErrorList?.length) {
      this.logger_.error(`[GLS] Request to ${path} failed: ${JSON.stringify(json)}`)
      throw new Error(`GLS request failed: ${JSON.stringify(json?.PrintLabelsErrorList ?? json)}`)
    }
    return json
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [{ id: "gls-home-delivery", name: "GLS házhozszállítás" }]
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: ValidateFulfillmentDataContext
  ) {
    return data
  }

  async validateOption(): Promise<boolean> {
    return true
  }

  async canCalculate(): Promise<boolean> {
    return false
  }

  async calculatePrice(): Promise<CalculatedShippingOptionPrice> {
    throw new Error("GLS uses flat-rate shipping options, not calculated pricing.")
  }

  async createFulfillment(
    data: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    fulfillment: Record<string, unknown>
  ): Promise<CreateFulfillmentResult> {
    const address = order?.shipping_address as any
    const pu = this.options_.pickupAddress

    const result = await this.call("/PrintLabels", {
      ParcelList: [
        {
          ClientNumber: Number(this.options_.clientNumber),
          ClientReference: order?.display_id?.toString(),
          Content: "Matcha tea",
          Count: 1,
          PickupAddress: {
            Name: pu.name,
            Street: pu.street,
            HouseNumber: pu.houseNumber,
            City: pu.city,
            ZipCode: pu.zipCode,
            CountryIsoCode: pu.countryIsoCode,
            ContactEmail: pu.contactEmail,
            ContactPhone: pu.contactPhone,
          },
          DeliveryAddress: {
            Name: `${address?.first_name ?? ""} ${address?.last_name ?? ""}`.trim(),
            Street: address?.address_1,
            HouseNumber: address?.address_2 || "",
            City: address?.city,
            ZipCode: address?.postal_code,
            CountryIsoCode: (address?.country_code ?? "HU").toUpperCase(),
            ContactEmail: order?.email,
            ContactPhone: address?.phone,
          },
        },
      ],
    })

    const parcelInfo = result.ParcelInfoList?.[0]

    return {
      data: {
        ...(fulfillment.data as object),
        gls_parcel_id: parcelInfo?.ParcelId,
        gls_parcel_number: parcelInfo?.ParcelNumber,
        gls_label_base64: result.Labels,
      },
    }
  }

  async cancelFulfillment(data: Record<string, unknown>) {
    this.logger_.warn(
      `[GLS] cancelFulfillment called for parcel ${data.gls_parcel_number} - no confirmed public cancel API; cancel manually via the MyGLS web portal.`
    )
    return { data }
  }

  async getFulfillmentDocuments(data: Record<string, unknown>) {
    if (!data.gls_label_base64) return []
    return [{ base_64: data.gls_label_base64 as string, type: "application/pdf" }] as any
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

export default GlsFulfillmentService
