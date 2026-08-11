import assert from "node:assert/strict";
import test from "node:test";

import {
  isPublicNetworkAddress,
  validateRemoteFileUrl,
} from "../shared/utils/remote-file-url.ts";

test("accepts a public HTTPS file URL", () => {
  assert.deepEqual(
    validateRemoteFileUrl("https://cdn.example.com/assets/image.png", ["93.184.216.34"]),
    { valid: true, url: "https://cdn.example.com/assets/image.png" },
  );
});

test("rejects unsupported schemes and credential-bearing URLs", () => {
  assert.equal(validateRemoteFileUrl("file:///etc/passwd", []).valid, false);
  assert.equal(validateRemoteFileUrl("https://user:pass@example.com/file.pdf", ["93.184.216.34"]).valid, false);
});

test("rejects localhost and cloud metadata destinations", () => {
  assert.equal(validateRemoteFileUrl("http://localhost/file", ["127.0.0.1"]).valid, false);
  assert.equal(validateRemoteFileUrl("http://169.254.169.254/latest/meta-data", ["169.254.169.254"]).valid, false);
});

test("rejects private IPv4 and local IPv6 ranges", () => {
  for (const address of ["10.0.0.1", "172.16.0.1", "192.168.1.5", "127.0.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1"]) {
    assert.equal(isPublicNetworkAddress(address), false, address);
  }
});

test("rejects a public hostname when any resolved address is unsafe", () => {
  assert.equal(
    validateRemoteFileUrl("https://example.com/file.pdf", ["93.184.216.34", "10.0.0.9"]).valid,
    false,
  );
});
