import assert from "node:assert/strict";
import test from "node:test";

import {
  GoogleOAuthRefreshError,
  refreshGoogleOAuthAccessToken,
} from "../server/utils/googleOAuthRefresh.ts";

const credentials = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
};

test("retries a temporary Google OAuth transport failure", async () => {
  let attempts = 0;
  const result = await refreshGoogleOAuthAccessToken({
    ...credentials,
    retryDelayMs: 0,
    fetchToken: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new TypeError("Client network socket disconnected before secure TLS connection was established");
      }
      return { access_token: "new-access-token", expires_in: 3600 };
    },
  });

  assert.deepEqual(result, { access_token: "new-access-token", expires_in: 3600 });
  assert.equal(attempts, 2);
});

test("marks invalid_grant as requiring Google Drive reconnection without retrying", async () => {
  let attempts = 0;

  await assert.rejects(
    refreshGoogleOAuthAccessToken({
      ...credentials,
      retryDelayMs: 0,
      fetchToken: async () => {
        attempts += 1;
        throw { data: { error: "invalid_grant" } };
      },
    }),
    (error) => {
      assert.ok(error instanceof GoogleOAuthRefreshError);
      assert.equal(error.reconnectRequired, true);
      assert.equal(error.message, "Google Drive session expired. Please reconnect.");
      return true;
    },
  );

  assert.equal(attempts, 1);
});

test("reports exhausted transport failures as temporary instead of expired", async () => {
  let attempts = 0;

  await assert.rejects(
    refreshGoogleOAuthAccessToken({
      ...credentials,
      maxAttempts: 2,
      retryDelayMs: 0,
      fetchToken: async () => {
        attempts += 1;
        throw new TypeError("fetch failed");
      },
    }),
    (error) => {
      assert.ok(error instanceof GoogleOAuthRefreshError);
      assert.equal(error.reconnectRequired, false);
      assert.equal(error.message, "Google Drive is temporarily unavailable. Please try again.");
      return true;
    },
  );

  assert.equal(attempts, 2);
});
