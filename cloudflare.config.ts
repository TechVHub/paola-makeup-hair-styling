
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
