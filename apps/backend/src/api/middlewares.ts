import { defineMiddlewares } from "@medusajs/framework/http"

export default defineMiddlewares({
  routes: [
    {
      // AI Stúdió requests carry base64 images (critique / save), which blow
      // past the default JSON body limit.
      matcher: "/admin/ai-studio/*",
      bodyParser: { sizeLimit: "25mb" },
    },
  ],
})
