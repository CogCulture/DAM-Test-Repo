import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveRemoteFilename,
  fetchRemoteFile,
} from "../server/utils/remoteFile.ts";

const publicResolver = async () => ["93.184.216.34"];

test("derives a UTF-8 content-disposition filename", () => {
  assert.equal(
    deriveRemoteFilename(
      "https://cdn.example.com/download",
      "attachment; filename*=UTF-8''Campaign%20Photo.jpg",
      "image/jpeg",
    ),
    "Campaign Photo.jpg",
  );
});

test("downloads bounded bytes and reports the final filename", async () => {
  const result = await fetchRemoteFile({
    url: "https://cdn.example.com/download",
    maxBytes: 32,
    resolveHost: publicResolver,
    fetchImpl: async () => new Response("hello", {
      headers: {
        "content-type": "text/plain",
        "content-disposition": "attachment; filename=message.txt",
        "content-length": "5",
      },
    }),
  });

  assert.equal(result.bytes.toString("utf8"), "hello");
  assert.equal(result.filename, "message.txt");
  assert.equal(result.contentType, "text/plain");
});

test("rejects a declared remote file larger than the configured limit", async () => {
  await assert.rejects(
    fetchRemoteFile({
      url: "https://cdn.example.com/large.bin",
      maxBytes: 4,
      resolveHost: publicResolver,
      fetchImpl: async () => new Response("12345", { headers: { "content-length": "5" } }),
    }),
    /too large/i,
  );
});

test("rejects a streamed response that exceeds the limit without a length header", async () => {
  await assert.rejects(
    fetchRemoteFile({
      url: "https://cdn.example.com/chunked.bin",
      maxBytes: 4,
      resolveHost: publicResolver,
      fetchImpl: async () => new Response("12345"),
    }),
    /too large/i,
  );
});

test("revalidates redirect destinations and rejects private addresses", async () => {
  let requests = 0;
  await assert.rejects(
    fetchRemoteFile({
      url: "https://cdn.example.com/file.pdf",
      maxBytes: 100,
      resolveHost: async (hostname) => hostname === "127.0.0.1" ? ["127.0.0.1"] : ["93.184.216.34"],
      fetchImpl: async () => {
        requests += 1;
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/internal" },
        });
      },
    }),
    /private|unsafe|local/i,
  );
  assert.equal(requests, 1);
});
