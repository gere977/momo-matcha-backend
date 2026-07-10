import { loadEnv, defineConfig, Modules } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// Redis-backed cache/event-bus/workflow-engine/locking use BullMQ, which holds long-lived
// *blocking* Redis connections. Railway's Redis drops idle/blocking connections (surfaces as
// "Connection ended unexpectedly"), and the Medusa loaders set maxRetriesPerRequest:null, so a
// command on a dropped connection retries forever instead of erroring. That hangs boot inside
// createDefaultsWorkflow (right after route registration) and the server never binds its port -
// verified by A/B test: with these modules the process never listens; without them it binds in ~4s.
// Same failure the config originally hit with Upstash. Fall back to Medusa's in-memory defaults
// (identical to local dev) unless explicitly opted in via USE_REDIS_MODULES=true.
const isProduction = process.env.NODE_ENV === 'production'
const useRedisModules = isProduction && process.env.USE_REDIS_MODULES === 'true'

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    }
  },
  modules: [
    {
      // First-party pageview analytics (admin "Statisztika" page)
      resolve: './src/modules/analytics-lite',
    },
    {
      // Reviews + waitlist signups (admin "Vélemények", storefront reviews)
      resolve: './src/modules/crm-lite',
    },
    ...(useRedisModules
      ? [
          {
            key: Modules.CACHE,
            resolve: '@medusajs/cache-redis',
            options: { redisUrl: process.env.REDIS_URL },
          },
          {
            key: Modules.EVENT_BUS,
            resolve: '@medusajs/event-bus-redis',
            options: { redisUrl: process.env.REDIS_URL },
          },
          {
            key: Modules.WORKFLOW_ENGINE,
            resolve: '@medusajs/workflow-engine-redis',
            options: {
              redis: {
                redisUrl: process.env.REDIS_URL,
              },
            },
          },
          {
            key: Modules.LOCKING,
            resolve: '@medusajs/locking',
            options: {
              providers: [
                {
                  resolve: '@medusajs/locking-redis',
                  id: 'locking-redis',
                  is_default: true,
                  options: { redisUrl: process.env.REDIS_URL },
                },
              ],
            },
          },
        ]
      : []),
    {
      key: Modules.PAYMENT,
      resolve: '@medusajs/payment',
      options: {
        providers: [
          {
            resolve: './src/modules/payment-barion',
            id: 'barion',
            options: {
              posKey: process.env.BARION_POS_KEY,
              environment: process.env.BARION_ENVIRONMENT || 'test',
              payeeEmail: process.env.BARION_PAYEE_EMAIL,
            },
          },
          {
            // Cash on delivery ("utánvét") - authorizes immediately, the
            // courier collects on delivery. Fee handled via shipping options.
            resolve: './src/modules/payment-cod',
            id: 'cod',
          },
        ],
      },
    },
    {
      key: Modules.FULFILLMENT,
      resolve: '@medusajs/fulfillment',
      options: {
        providers: [
          {
            resolve: '@medusajs/fulfillment-manual',
            id: 'manual',
          },
          {
            resolve: './src/modules/fulfillment-foxpost',
            id: 'foxpost',
            options: {
              apiKey: process.env.FOXPOST_API_KEY,
              environment: process.env.FOXPOST_ENVIRONMENT || 'test',
            },
          },
          {
            resolve: './src/modules/fulfillment-gls',
            id: 'gls',
            options: {
              username: process.env.GLS_USERNAME,
              password: process.env.GLS_PASSWORD,
              clientNumber: process.env.GLS_CLIENT_NUMBER,
              environment: process.env.GLS_ENVIRONMENT || 'test',
              pickupAddress: {
                name: process.env.GLS_PICKUP_NAME || 'Momo Matcha',
                street: process.env.GLS_PICKUP_STREET || '',
                houseNumber: process.env.GLS_PICKUP_HOUSE_NUMBER || '',
                city: process.env.GLS_PICKUP_CITY || '',
                zipCode: process.env.GLS_PICKUP_ZIP || '',
                countryIsoCode: 'HU',
                contactEmail: process.env.GLS_PICKUP_EMAIL || 'admin@momomatcha.hu',
                contactPhone: process.env.GLS_PICKUP_PHONE || '',
              },
            },
          },
        ],
      },
    },
    {
      key: Modules.NOTIFICATION,
      resolve: '@medusajs/notification',
      options: {
        providers: [
          {
            // Custom Resend provider (src/modules/notification-resend). Sends real,
            // branded emails via the Resend REST API when RESEND_API_KEY is set, and
            // just logs when it isn't (e.g. local dev) so nothing breaks. Handles the
            // order-confirmation / shipping-confirmation / password-reset / welcome
            // templates used by the subscribers.
            resolve: './src/modules/notification-resend',
            id: 'resend',
            options: {
              channels: ['email'],
              apiKey: process.env.RESEND_API_KEY,
              from:
                process.env.RESEND_FROM_EMAIL ||
                'Momo Matcha <onboarding@resend.dev>',
            },
          },
        ],
      },
    },
  ],
})
