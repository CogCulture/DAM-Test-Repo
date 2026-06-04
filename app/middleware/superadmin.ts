export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === "/superadmin/login") return;

  try {
    const data = await $fetch<{ authenticated: boolean }>("/api/superadmin/session");
    if (!data.authenticated) {
      return navigateTo("/superadmin/login");
    }
  } catch {
    return navigateTo("/superadmin/login");
  }
});
