export const createHealthPayload = () => ({
  status: "ok" as const,
  service: "dam-portal" as const,
});
