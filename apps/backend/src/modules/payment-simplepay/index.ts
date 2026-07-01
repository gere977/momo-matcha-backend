import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import SimplePayProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [SimplePayProviderService],
})
