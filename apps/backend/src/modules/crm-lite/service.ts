import { MedusaService } from "@medusajs/framework/utils"
import { Review } from "./models/review"
import { WaitlistSignup } from "./models/waitlist-signup"

class CrmLiteModuleService extends MedusaService({ Review, WaitlistSignup }) {}

export default CrmLiteModuleService
