export default defineEventHandler(() => {
  throw createError({
    status: 410,
    message: "This legacy upload endpoint is disabled. Use the governed DAM upload endpoint.",
  });
});
