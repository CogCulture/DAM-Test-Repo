import { fileURLToPath } from "node:url";
import { parsePublicBooleanFlag } from "./shared/utils/public-feature-flags";

const isGcpRuntime = process.env.NITRO_PRESET === "node-server" || Boolean(process.env.DATABASE_PATH);

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  srcDir: "app",
  runtimeConfig: {
    public: {
      enableGDriveStorage: parsePublicBooleanFlag(process.env.NUXT_PUBLIC_ENABLE_GDRIVE_STORAGE),
    },
  },
  devtools: { enabled: process.env.NODE_ENV !== "production" },
  // ssr: false,
  nitro: {
    preset: process.env.NITRO_PRESET || "cloudflare_module",
    imports: {
      presets: [
        {
          from: fileURLToPath(new URL("./node_modules/nuxt-auth-utils/dist/runtime/server/utils/session.js", import.meta.url)).replace(/\\/g, "/"),
          imports: [
            "clearUserSession",
            "getUserSession",
            "requireUserSession",
            "replaceUserSession",
            "setUserSession",
          ],
        },
        {
          from: fileURLToPath(new URL("./node_modules/nuxt-auth-utils/dist/runtime/server/lib/oauth/github.js", import.meta.url)).replace(/\\/g, "/"),
          imports: ["defineOAuthGitHubEventHandler"],
        },
        {
          from: fileURLToPath(new URL("./node_modules/nuxt-auth-utils/dist/runtime/server/lib/oauth/google.js", import.meta.url)).replace(/\\/g, "/"),
          imports: ["defineOAuthGoogleEventHandler"],
        },
      ],
    },
  },
  routeRules: {
    "/**": { ssr: false },
    "/api/**": { ssr: true },
    "/preview/**": { ssr: true },
    "/public/**": { cors: true, ssr: true },
  },
  modules: [
    "@nuxt/ui",
    ...(!isGcpRuntime ? ["@nuxthub/core"] : []),
    "nuxt-auth-utils",
    "@formkit/auto-animate/nuxt",
  ],

  css: ["~/assets/css/main.css"],
  hub: {
    blob: !isGcpRuntime,
    database: !isGcpRuntime,
  },
  icon: {
    mode: "svg",
  },
  future: {
    compatibilityVersion: 4,
  },
  compatibilityDate: "2024-11-27",
});
