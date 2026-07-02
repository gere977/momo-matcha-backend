import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

// Redirect the backend root ("/") to the admin dashboard ("/app") so visiting
// the bare domain (e.g. https://admin.momomatcha.hu/) lands on the admin login
// instead of "Cannot GET /". Medusa's route loader maps this file to GET "/"
// (registers app.get("/", ...)). A middleware does NOT work here because
// defineMiddlewares middlewares only run for paths that have a registered
// route, so an unrouted "/" hits the 404 handler first. API routes (/store,
// /admin, /health, ...) and the /app SPA are unaffected.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.redirect("/app");
}
