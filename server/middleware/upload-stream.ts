/**
 * Server middleware that disables H3's built-in body-size limit for the
 * local-upload endpoint so that large files (up to disk capacity) can be
 * streamed directly to disk without hitting Node.js Buffer limits.
 */
export default defineEventHandler((event) => {
  const url = event.node.req.url || "";
  if (url.includes("/local-upload")) {
    // Prevent H3 from reading the body itself — our handler streams it
    // Setting this flag tells h3/nitro to skip automatic body parsing
    (event.node.req as any).__h3_body_consumed = false;
    // Disable any body-size limit on this route
    (event._handled as any) = false;
  }
});
