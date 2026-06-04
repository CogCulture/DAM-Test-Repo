import { authHandler } from "~~/server/utils/auth";

export default defineOAuthGitHubEventHandler({
  config: {
    emailRequired: true,
  },
  async onSuccess(event: any, { user }: { user: any }) {
    const { email, name, login, avatar_url: avatar } = user;
    const authUser = await authHandler({
      name: name || login || email.split("@")[0],
      email,
      provider: "github",
      avatar,
    });
    await setUserSession(event, { user: authUser });
    // If user needs to complete their profile (no role/dept set yet)
    if (authUser.approvalStatus === "needs_profile") {
      return sendRedirect(event, "/auth/complete-profile");
    }
    // If user is waiting for org creation approval
    if (authUser.approvalStatus === "pending_org") {
      return sendRedirect(event, "/auth/org-pending");
    }
    // If user is pending approval
    if (authUser.approvalStatus === "pending") {
      return sendRedirect(event, "/auth/pending");
    }
    return sendRedirect(event, "/");
  },
});
