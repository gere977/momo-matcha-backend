import { loadEnv, defineConfig, Modules } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// Redis-backed cache/event-bus/workflow-engine/locking are production-only: Upstash's
// serverless Redis hung on these locally (see project notes), so local dev deliberately
// uses Medusa's in-memory defaults instead. Railway's own dedicated Redis is a normal
// instance and shouldn't have the same issue - gating on NODE_ENV keeps local dev safe
// even though REDIS_URL happens to be set locally too (pointed at Upstash for reference).
const isProduction = process.env.NODE_ENV === 'production'

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
    ...(isProduction
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
            },
          },
          {
            resolve: './src/modules/payment-simplepay',
            id: 'simplepay',
            options: {
              merchantId: process.env.SIMPLEPAY_MERCHANT_ID,
              secretKeys: {
                HUF: process.env.SIMPLEPAY_SECRET_KEY_HUF,
              },
              environment: process.env.SIMPLEPAY_ENVIRONMENT || 'sandbox',
            },
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
            // Logs notifications to the console instead of sending real email - swap this
            // block for '@medusajs/notification-sendgrid' (options: { apiKey, from }) once
            // you have a SendGrid account and have designed the dynamic templates there.
            resolve: '@medusajs/notification-local',
            id: 'local',
            options: {
              channels: ['email'],
            },
          },
        ],
      },
    },
  ],
})
