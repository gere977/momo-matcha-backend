import { Module } from "@medusajs/framework/utils"
import CrmLiteModuleService from "./service"

export const CRM_LITE_MODULE = "crm_lite"

export default Module(CRM_LITE_MODULE, {
  service: CrmLiteModuleService,
})
