// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true }, // triggered refresh to clear route cache
  // ssr: false,
  nitro: {
    preset: "cloudflare_module",
  },
  routeRules: {
    "/**": { ssr: false },
    "/api/**": { ssr: true },
    "/preview/**": { ssr: true },
    "/public/**": { cors: true, ssr: true },
  },
  modules: [
    "@nuxt/ui",
    "@nuxthub/core",
    "nuxt-auth-utils",
    "@formkit/auto-animate/nuxt",
  ],

  css: ["~/assets/css/main.css"],
  hub: {
    blob: true,
    database: true,
  },
  icon: {
    mode: "svg",
  },
  future: {
    compatibilityVersion: 4,
  },
  compatibilityDate: "2024-11-27",
});
