import { defineMiddlewares } from "@medusajs/framework/http";
import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http";

// Redirect the bare backend root ("/") to the admin dashboard ("/app") so
// visiting e.g. https://admin.momomatcha.hu/ lands on the admin login instead
// of "Cannot GET /". A middleware (not a route file) is used because Medusa
// does not register a route handler at the absolute root; a middleware runs in
// the request pipeline regardless. The regex matcher targets ONLY "/", so API
// routes (/store, /admin, /health, ...) and the /app SPA are unaffected.
export default defineMiddlewares({
  routes: [
    {
      matcher: /^\/$/,
      middlewares: [
        (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
          res.redirect("/app");
        },
      ],
    },
  ],
});
