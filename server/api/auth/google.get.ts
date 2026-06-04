import { authHandler } from "~~/server/utils/auth";
import { gdriveFolders } from "~~/server/database/schema";
import { useDrizzle } from "~~/server/utils/drizzle";
import { eq } from "drizzle-orm";
import { ulid } from "ulidx";

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
    const isGDriveFlow = query.state === "gdrive" || (tokens.scope && tokens.scope.includes("auth/drive"));

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

      if (authUser.approvalStatus === "needs_profile") {
        return sendRedirect(event, "/auth/complete-profile");
      }

      return sendRedirect(event, "/gdrive/select");
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

export default defineEventHandler(async (event) => {
  const query = getQuery(event);

  // Intercept the redirect flow when starting a Google Drive connection
  if (query.gdrive === "true" && !query.code) {
    const config = useRuntimeConfig();
    const clientId = config.public.oauth?.google?.clientId || process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID;
    const host = getRequestHost(event);
    const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
    const redirectUri = `${protocol}://${host}/api/auth/google`;

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

  return oauthHandler(event);
});
