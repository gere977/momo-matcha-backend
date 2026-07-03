import { MedusaService } from "@medusajs/framework/utils"
import { PageView } from "./models/page-view"

class AnalyticsLiteModuleService extends MedusaService({ PageView }) {}

export default AnalyticsLiteModuleService
