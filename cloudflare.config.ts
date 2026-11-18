
import {
  bindings,
  defineConfig,
  defineWorker,
} from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "paola-makeup-hair-styling",

    entrypoint: "vinext/server/fetch-handler",

    compatibilityDate: "2026-11-05",

    compatibilityFlags: ["nodejs_compat"],

    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",

      runWorkerFirst: [
        "/*",
        "!/_next/static/*",
        "!/*/_next/static/*",
      ],
    },

    env: {
      // Cloudflare D1 database
      DB: bindings.d1({
        name: "paola-makeup-production",
        id: "487d7773-0d6e-4dfe-83b5-3e8000d105ce",
      }),

      // Cloudflare services
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),

      // Supabase public configuration
      NEXT_PUBLIC_SUPABASE_URL: bindings.secret(),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: bindings.secret(),

      // Supabase server-only credential
      SUPABASE_SERVICE_ROLE_KEY: bindings.secret(),

      // Cloudflare Turnstile
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: bindings.secret(),
      TURNSTILE_SECRET_KEY: bindings.secret(),

      // Resend email notifications
      RESEND_API_KEY: bindings.secret(),
      BOOKING_FROM_EMAIL: bindings.secret(),
      PAOLA_ADMIN_EMAIL: bindings.secret(),
    },
  }),
});
