import { authHandler } from "~~/server/utils/auth";
import { gdriveFolders } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { eq } from "drizzle-orm";
import { ulid } from "ulidx";
import { saveGcsOAuthTokens } from "~~/server/utils/byosStorage";

const oauthHandler = defineOAuthGoogleEventHandler({
  config: {
    emailRequired: true,
  },
  async onSuccess(event: any, { user, tokens }: { user: any; tokens: any }) {
    const query = getQuery(event);
    const { email, name, picture: avatar } = user;

    const authUser = await authHandler({
      name: name || email.split("@")[0],
      email,
      provider: "google",
      avatar,
    });

    await setUserSession(event, { user: authUser });

    // Check if this callback belongs to a Google Drive connection flow
    const isGDriveFlow = query.state === "gdrive";


    if (isGDriveFlow) {
      const db = useDrizzle();
      const existing = await db
        .select()
        .from(gdriveFolders)
        .where(eq(gdriveFolders.userId, authUser.id));

      const expiresAt = Date.now() + tokens.expires_in * 1000;

      if (existing && existing.length > 0) {
        await db
          .update(gdriveFolders)
          .set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || existing[0].refreshToken,
            expiresAt: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(gdriveFolders.id, existing[0].id));
      } else {
        await db.insert(gdriveFolders).values({
          id: ulid(),
          userId: authUser.id,
          organizationId: authUser.organizationId || "org_default",
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          expiresAt: expiresAt,
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // If user still needs to complete their profile, send them back to complete-profile
      // so they can finish the org setup with the folder picker inline
      if (authUser.approvalStatus === "needs_profile" || authUser.approvalStatus === "pending_org") {
        return sendRedirect(event, "/auth/complete-profile");
      }

      return sendRedirect(event, "/gdrive/select");
    }

    // ── GCS OAuth flow (Options A & C) ──────────────────────────────────────
    const gcsMode = query.state === "gcs_a" ? "oauth_manual" : query.state === "gcs_c" ? "oauth_auto" : null;
    if (gcsMode) {
      const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
      await saveGcsOAuthTokens(
        authUser.id,
        gcsMode,
        tokens.access_token,
        tokens.refresh_token || null,
        expiresAt
      );
      return sendRedirect(event, "/auth/complete-profile?gcs=connected");
    }

    const inviteToken = getCookie(event, "invite_token");
    if (inviteToken) {
      return sendRedirect(event, `/auth/invite?token=${inviteToken}`);
    }

    // Default flow
    if (authUser.approvalStatus === "needs_profile") {
      return sendRedirect(event, "/auth/complete-profile");
    }
    if (authUser.approvalStatus === "pending_org") {
      return sendRedirect(event, "/auth/org-pending");
    }
    if (authUser.approvalStatus === "pending") {
      return sendRedirect(event, "/auth/pending");
    }
    return sendRedirect(event, "/");
  },
});

function getRedirectUri(event: any) {
  const reqUrl = getRequestURL(event);
  const configuredUri =
    process.env.NUXT_OAUTH_GOOGLE_REDIRECT_URL;

  if (configuredUri && !configuredUri.includes("localhost") && !configuredUri.includes("127.0.0.1")) {
    return configuredUri;
  }

  return `${reqUrl.protocol}//${reqUrl.host}/api/auth/google`;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const redirectUri = getRedirectUri(event);

  // Intercept the redirect flow when starting a Google Drive connection
  if (query.gdrive === "true" && !query.code) {
    const config = useRuntimeConfig(event);
    const clientId = (config.public as any).oauth?.google?.clientId || process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID;

    const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent("openid email profile https://www.googleapis.com/auth/drive")}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=gdrive`;

    return sendRedirect(event, authorizationUrl);
  }

  // Intercept GCS Option A (oauth_manual) — devstorage.read_write scope only
  if (query.gcs === "a" && !query.code) {
    const config = useRuntimeConfig(event);
    const clientId = (config.public as any).oauth?.google?.clientId || process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID;

    const scopes = [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/devstorage.read_write",
    ].join(" ");

    const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=gcs_a`;

    return sendRedirect(event, authorizationUrl);
  }

  // Intercept GCS Option C (oauth_auto) — cloud-platform scope for project+bucket discovery
  if (query.gcs === "c" && !query.code) {
    const config = useRuntimeConfig(event);
    const clientId = (config.public as any).oauth?.google?.clientId || process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID;

    const scopes = [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/cloud-platform",
    ].join(" ");

    const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=gcs_c`;

    return sendRedirect(event, authorizationUrl);
  }

  const handler = defineOAuthGoogleEventHandler({
    config: {
      emailRequired: true,
      redirectURL: redirectUri,
    },
    async onSuccess(event: any, { user, tokens }: { user: any; tokens: any }) {
      const query = getQuery(event);
      const { email, name, picture: avatar } = user;

      const authUser = await authHandler({
        name: name || email.split("@")[0],
        email,
        provider: "google",
        avatar,
      });

      await setUserSession(event, { user: authUser });

      // Check if this callback belongs to a Google Drive connection flow
      const isGDriveFlow = query.state === "gdrive";

      if (isGDriveFlow) {
        const db = useDrizzle();
        const existing = await db
          .select()
          .from(gdriveFolders)
          .where(eq(gdriveFolders.userId, authUser.id));

        const expiresAt = Date.now() + tokens.expires_in * 1000;

        if (existing && existing.length > 0) {
          await db
            .update(gdriveFolders)
            .set({
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || existing[0].refreshToken,
              expiresAt: expiresAt,
              updatedAt: new Date(),
            })
            .where(eq(gdriveFolders.id, existing[0].id));
        } else {
          await db.insert(gdriveFolders).values({
            id: ulid(),
            userId: authUser.id,
            organizationId: authUser.organizationId || "org_default",
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            expiresAt: expiresAt,
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        // If user still needs to complete their profile, send them back to complete-profile
        // so they can finish the org setup with the folder picker inline
        if (authUser.approvalStatus === "needs_profile" || authUser.approvalStatus === "pending_org") {
          return sendRedirect(event, "/auth/complete-profile");
        }

        return sendRedirect(event, "/gdrive/select");
      }

      // ── GCS OAuth flow (Options A & C) ──────────────────────────────────────
      const gcsMode = query.state === "gcs_a" ? "oauth_manual" : query.state === "gcs_c" ? "oauth_auto" : null;
      if (gcsMode) {
        const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
        await saveGcsOAuthTokens(
          authUser.id,
          gcsMode,
          tokens.access_token,
          tokens.refresh_token || null,
          expiresAt
        );
        return sendRedirect(event, "/auth/complete-profile?gcs=connected");
      }

      const inviteToken = getCookie(event, "invite_token");
      if (inviteToken) {
        return sendRedirect(event, `/auth/invite?token=${inviteToken}`);
      }

      // Default flow
      if (authUser.approvalStatus === "needs_profile") {
        return sendRedirect(event, "/auth/complete-profile");
      }
      if (authUser.approvalStatus === "pending_org") {
        return sendRedirect(event, "/auth/org-pending");
      }
      if (authUser.approvalStatus === "pending") {
        return sendRedirect(event, "/auth/pending");
      }
      return sendRedirect(event, "/");
    },
  });

  return handler(event);
});
