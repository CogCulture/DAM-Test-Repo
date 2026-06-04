export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user, fetch: fetchSession } = useUserSession();

  // Public routes: auth pages + superadmin (handled by its own middleware)
  const publicRoutes = ["/auth/signin", "/auth/complete-profile", "/auth/pending", "/auth/org-pending", "/superadmin"];
  if (publicRoutes.some((r) => to.path.startsWith(r))) return;

  if (!loggedIn.value) {
    return navigateTo("/auth/signin");
  }

  // Trigger background session refresh client-side to ensure permissions update dynamically
  if (import.meta.client) {
    $fetch("/api/auth/refresh", { method: "POST" })
      .then(() => fetchSession())
      .catch((e) => console.error("Error refreshing session:", e));
  }

  const approvalStatus = (user.value as any)?.approvalStatus;

  if (approvalStatus === "needs_profile") {
    return navigateTo("/auth/complete-profile");
  }
  if (approvalStatus === "pending_org") {
    return navigateTo("/auth/org-pending");
  }
  if (approvalStatus === "pending") {
    return navigateTo("/auth/pending");
  }
  if (approvalStatus === "rejected") {
    return navigateTo("/auth/signin");
  }
});
