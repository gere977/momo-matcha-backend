import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import BarionProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [BarionProviderService],
})
