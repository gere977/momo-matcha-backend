import { Module } from "@medusajs/framework/utils"
import AnalyticsLiteModuleService from "./service"

export const ANALYTICS_LITE_MODULE = "analytics_lite"

export default Module(ANALYTICS_LITE_MODULE, {
  service: AnalyticsLiteModuleService,
})
