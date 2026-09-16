export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user, fetch: fetchSession } = useUserSession();

  // Public routes: auth pages + superadmin (handled by its own middleware)
  const publicRoutes = ["/auth/signin", "/auth/select-storage", "/auth/complete-profile", "/auth/pending", "/auth/org-pending", "/auth/suspended", "/superadmin", "/admin/gdrive-setup"];
  if (publicRoutes.some((r) => to.path.startsWith(r))) return;

  if (!loggedIn.value) {
    return navigateTo("/auth/signin");
  }

  // Trigger background session refresh client-side to ensure permissions update dynamically
  if (import.meta.client) {
    $fetch("/api/auth/refresh", { method: "POST" })
      .then(async () => {
        await fetchSession();
        if (!loggedIn.value) {
          window.location.href = "/auth/signin";
        }
      })
      .catch((e) => {
        console.error("Error refreshing session:", e);
      });
  }


  const organizationStatus = (user.value as any)?.organizationStatus;
  if (organizationStatus === "suspended") {
    return navigateTo("/auth/suspended");
  }

  const role = user.value?.role;
  const orgType = (user.value as any)?.orgType;
  const setupComplete = (user.value as any)?.setupComplete;

  if (role === "admin" && orgType === "gdrive" && setupComplete === false) {
    return navigateTo("/admin/gdrive-setup");
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

  // Active users must have an organization. If they don't, redirect them to complete their profile.
  if (!user.value?.organizationId) {
    return navigateTo("/auth/complete-profile");
  }
});
