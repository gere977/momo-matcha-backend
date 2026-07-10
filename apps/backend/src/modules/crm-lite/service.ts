import { MedusaService } from "@medusajs/framework/utils"
import { MarketingAsset } from "./models/marketing-asset"
import { Review } from "./models/review"
import { WaitlistSignup } from "./models/waitlist-signup"

class CrmLiteModuleService extends MedusaService({
  Review,
  WaitlistSignup,
  MarketingAsset,
}) {}

export default CrmLiteModuleService
