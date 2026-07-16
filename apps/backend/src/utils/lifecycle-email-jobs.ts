// Local development shares the production Neon database. Scheduled email jobs
// must therefore be opt-in in production and completely inert locally; this
// prevents real orders from being marked as emailed by a no-op provider.
export function lifecycleEmailJobsEnabled(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_LIFECYCLE_EMAIL_JOBS === "true" &&
    Boolean(process.env.RESEND_API_KEY)
  )
}
