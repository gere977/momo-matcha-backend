import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import GlsFulfillmentService from "./service"

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [GlsFulfillmentService],
})
