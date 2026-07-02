import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

// Redirect the backend root to the admin dashboard so visiting the bare
// domain (e.g. https://admin.momomatcha.hu/) lands on the admin login
// instead of "Cannot GET /". API routes (/store, /admin, /health, ...) and
// the admin SPA at /app are unaffected.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.redirect("/app");
}
