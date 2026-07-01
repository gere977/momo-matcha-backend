import crypto from "crypto"
import zlib from "zlib"

// Implements the plumbing (auth, signing, tokenExchange, manageInvoice, queryTransactionStatus)
// of NAV's Online Számla v3.0 interface. Algorithm details (requestSignature concatenation order,
// passwordHash, and the AES-128-ECB token decryption) are confirmed against the reference PHP
// client (github.com/pzs/nav-online-invoice) since NAV's own PDF spec isn't machine-readable.
// The generated <Invoice> XML body itself (buildInvoiceXml below) covers the core required fields
// only - NAV's full Invoice XSD has many transaction-type-specific optional/conditional fields,
// so this WILL need real sandbox validation and likely adjustment once you have technical user
// credentials (NAV's test environment returns specific validation error codes to fix against).

export type NavConfig = {
  login: string
  password: string
  signKey: string
  exchangeKey: string
  taxNumber: string // first 8 digits of the company's tax number (adószám)
  environment: "test" | "prod"
}

const BASE_URLS: Record<NavConfig["environment"], string> = {
  test: "https://api-test.onlineszamla.nav.gov.hu/invoiceService/v3",
  prod: "https://api.onlineszamla.nav.gov.hu/invoiceService/v3",
}

function sha3_512Upper(input: string) {
  return crypto.createHash("sha3-512").update(input, "utf8").digest("hex").toUpperCase()
}

function sha512Upper(input: string) {
  return crypto.createHash("sha512").update(input, "utf8").digest("hex").toUpperCase()
}

function isoTimestamp() {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z") // e.g. 2026-07-01T12:34:56Z
}

function timestampDigitsOnly(timestamp: string) {
  return timestamp.replace(/\.\d{3}|\D+/g, "")
}

function randomRequestId() {
  // NAV requires an alphanumeric ID, max 30 chars, unique per request.
  return `MOMO${Date.now()}${crypto.randomBytes(4).toString("hex")}`.slice(0, 30)
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export class NavClient {
  private baseUrl: string

  constructor(private config: NavConfig) {
    this.baseUrl = BASE_URLS[config.environment]
  }

  private buildHeaderXml(requestId: string, timestamp: string, requestVersion = "3.0") {
    const signature = sha3_512Upper(
      requestId + timestampDigitsOnly(timestamp) + this.config.signKey
    )
    return { requestId, timestamp, requestVersion, signature }
  }

  private buildEnvelope(
    bodyXml: string,
    requestId: string,
    timestamp: string,
    signature: string
  ) {
    const passwordHash = sha512Upper(this.config.password)
    return `<?xml version="1.0" encoding="UTF-8"?>
<Request xmlns="http://schemas.nav.gov.hu/OSA/3.0/api">
  <header>
    <requestId>${requestId}</requestId>
    <timestamp>${timestamp}</timestamp>
    <requestVersion>3.0</requestVersion>
    <headerVersion>1.0</headerVersion>
  </header>
  <user>
    <login>${xmlEscape(this.config.login)}</login>
    <passwordHash cryptoType="SHA-512">${passwordHash}</passwordHash>
    <taxNumber>${xmlEscape(this.config.taxNumber)}</taxNumber>
    <requestSignature cryptoType="SHA3-512">${signature}</requestSignature>
  </user>
  <software>
    <softwareId>MOMOMATCHAWEBSHOP1</softwareId>
    <softwareName>Momo Matcha Webshop</softwareName>
    <softwareOperation>ONLINE_SERVICE</softwareOperation>
    <softwareMainVersion>1.0</softwareMainVersion>
    <softwareDevName>Momo Matcha</softwareDevName>
    <softwareDevContact>admin@momomatcha.hu</softwareDevContact>
  </software>
  ${bodyXml}
</Request>`
  }

  private async post(path: string, xml: string) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml;charset=UTF-8",
        Accept: "application/xml",
      },
      body: xml,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`NAV ${path} failed (${response.status}): ${text}`)
    }
    return text
  }

  /** Exchanges credentials for a short-lived (~5 min) exchange token used by manageInvoice. */
  async tokenExchange(): Promise<string> {
    const requestId = randomRequestId()
    const timestamp = isoTimestamp()
    const { signature } = this.buildHeaderXml(requestId, timestamp)
    const xml = this.buildEnvelope("", requestId, timestamp, signature)

    const responseXml = await this.post("/tokenExchange", xml)
    const match = responseXml.match(/<encodedExchangeToken>([^<]+)<\/encodedExchangeToken>/)
    if (!match) {
      throw new Error(`NAV tokenExchange response missing encodedExchangeToken: ${responseXml}`)
    }

    // AES-128-ECB, key = raw exchangeKey bytes, input/output base64 (PKCS7 padding, default openssl behavior).
    const decipher = crypto.createDecipheriv(
      "aes-128-ecb",
      Buffer.from(this.config.exchangeKey, "utf8"),
      null
    )
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(match[1], "base64")),
      decipher.final(),
    ])
    return decrypted.toString("utf8")
  }

  /** Submits one or more invoice XML documents. Returns the transactionId to poll for status. */
  async manageInvoice(invoiceXmlDocs: string[], exchangeToken: string): Promise<string> {
    const requestId = randomRequestId()
    const timestamp = isoTimestamp()
    const { signature } = this.buildHeaderXml(requestId, timestamp)

    const operations = invoiceXmlDocs
      .map((invoiceXml, i) => {
        const gzipped = zlib.gzipSync(Buffer.from(invoiceXml, "utf8"))
        const base64Data = gzipped.toString("base64")
        const hash = sha3_512Upper(invoiceXml)
        return `<invoiceOperation>
      <index>${i + 1}</index>
      <invoiceOperation>CREATE</invoiceOperation>
      <invoiceData>${base64Data}</invoiceData>
      <electronicInvoiceHash cryptoType="SHA3-512">${hash}</electronicInvoiceHash>
    </invoiceOperation>`
      })
      .join("\n")

    const body = `<exchangeToken>${xmlEscape(exchangeToken)}</exchangeToken>
  <invoiceOperations>
    <compressedContent>true</compressedContent>
    ${operations}
  </invoiceOperations>`

    const xml = this.buildEnvelope(body, requestId, timestamp, signature)
    const responseXml = await this.post("/manageInvoice", xml)
    const match = responseXml.match(/<transactionId>([^<]+)<\/transactionId>/)
    if (!match) {
      throw new Error(`NAV manageInvoice response missing transactionId: ${responseXml}`)
    }
    return match[1]
  }

  async queryTransactionStatus(transactionId: string): Promise<string> {
    const requestId = randomRequestId()
    const timestamp = isoTimestamp()
    const { signature } = this.buildHeaderXml(requestId, timestamp)
    const body = `<transactionId>${xmlEscape(transactionId)}</transactionId>`
    const xml = this.buildEnvelope(body, requestId, timestamp, signature)
    return this.post("/queryTransactionStatus", xml)
  }
}

/**
 * Builds a minimal-but-valid NAV Invoice XML for a single-currency HUF sale.
 * Covers the core required fields only - extend as needed once validated against
 * NAV's test environment (e.g. discounts, foreign currency exchange rate, VAT
 * exemption reason codes for specific product categories).
 */
export function buildInvoiceXml(input: {
  invoiceNumber: string
  issueDate: string // YYYY-MM-DD
  fulfillmentDate: string // YYYY-MM-DD
  paymentDate: string // YYYY-MM-DD
  supplierTaxNumber: string
  supplierName: string
  supplierAddress: { city: string; postalCode: string; street: string }
  customerName: string
  customerEmail?: string
  customerAddress?: { city: string; postalCode: string; street: string; countryCode: string }
  lines: Array<{
    lineNumber: number
    description: string
    quantity: number
    unitPrice: number
    netAmount: number
    vatRate: number // e.g. 0.27 for 27%
    vatAmount: number
    grossAmount: number
  }>
  netTotal: number
  vatTotal: number
  grossTotal: number
}) {
  const lineXml = input.lines
    .map(
      (line) => `<line>
      <lineNumber>${line.lineNumber}</lineNumber>
      <lineDescription>${xmlEscape(line.description)}</lineDescription>
      <quantity>${line.quantity}</quantity>
      <unitOfMeasure>PIECE</unitOfMeasure>
      <unitPrice>${line.unitPrice}</unitPrice>
      <lineNetAmount>${line.netAmount}</lineNetAmount>
      <vatRate>${line.vatRate}</vatRate>
      <lineVatAmount>${line.vatAmount}</lineVatAmount>
      <lineGrossAmount>${line.grossAmount}</lineGrossAmount>
    </line>`
    )
    .join("\n")

  const customerBlock = input.customerAddress
    ? `<customerInfo>
      <customerName>${xmlEscape(input.customerName)}</customerName>
      <customerAddress>
        <countryCode>${input.customerAddress.countryCode}</countryCode>
        <postalCode>${input.customerAddress.postalCode}</postalCode>
        <city>${xmlEscape(input.customerAddress.city)}</city>
        <streetName>${xmlEscape(input.customerAddress.street)}</streetName>
      </customerAddress>
      ${input.customerEmail ? `<customerEmail>${xmlEscape(input.customerEmail)}</customerEmail>` : ""}
    </customerInfo>`
    : `<customerInfo>
      <customerName>${xmlEscape(input.customerName)}</customerName>
      ${input.customerEmail ? `<customerEmail>${xmlEscape(input.customerEmail)}</customerEmail>` : ""}
    </customerInfo>`

  return `<Invoice xmlns="http://schemas.nav.gov.hu/OSA/3.0/data">
  <invoiceHead>
    <invoiceNumber>${xmlEscape(input.invoiceNumber)}</invoiceNumber>
    <invoiceIssueDate>${input.issueDate}</invoiceIssueDate>
    <invoiceFulfillmentDate>${input.fulfillmentDate}</invoiceFulfillmentDate>
    <invoiceCurrency>HUF</invoiceCurrency>
    <invoiceExchangeRate>1</invoiceExchangeRate>
    <paymentMethod>TRANSFER</paymentMethod>
    <paymentDate>${input.paymentDate}</paymentDate>
    <supplierInfo>
      <supplierTaxNumber>${xmlEscape(input.supplierTaxNumber)}</supplierTaxNumber>
      <supplierName>${xmlEscape(input.supplierName)}</supplierName>
      <supplierAddress>
        <countryCode>HU</countryCode>
        <postalCode>${xmlEscape(input.supplierAddress.postalCode)}</postalCode>
        <city>${xmlEscape(input.supplierAddress.city)}</city>
        <streetName>${xmlEscape(input.supplierAddress.street)}</streetName>
      </supplierAddress>
    </supplierInfo>
    ${customerBlock}
  </invoiceHead>
  <invoiceLines>
    ${lineXml}
  </invoiceLines>
  <invoiceSummary>
    <invoiceNetAmount>${input.netTotal}</invoiceNetAmount>
    <invoiceVatAmount>${input.vatTotal}</invoiceVatAmount>
    <invoiceGrossAmount>${input.grossTotal}</invoiceGrossAmount>
  </invoiceSummary>
</Invoice>`
}
