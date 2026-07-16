import { MedusaService } from "@medusajs/framework/utils"
import { EmailPreference } from "./models/email-preference"
import { MarketingAsset } from "./models/marketing-asset"
import { Review } from "./models/review"
import { WaitlistSignup } from "./models/waitlist-signup"

class CrmLiteModuleService extends MedusaService({
  Review,
  WaitlistSignup,
  MarketingAsset,
  EmailPreference,
}) {}

export default CrmLiteModuleService
