import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import FoxpostFulfillmentService from "./service"

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [FoxpostFulfillmentService],
})
