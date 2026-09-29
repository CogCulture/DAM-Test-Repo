/**
 * Server middleware that disables H3's built-in body parsing for local-upload
 * endpoints so that large files can be streamed or read raw without H3 trying
 * to parse multipart data.
 */
export default defineEventHandler((event) => {
  const url = event.node.req.url || "";
  if (url.includes("/local-upload")) {
    (event.node.req as any).__h3_body_consumed = false;
  }
});

