export interface GoogleOAuthTokenResponse {
  access_token: string;
  expires_in: number;
}

type TokenFetcher = (
  url: string,
  options: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  },
) => Promise<GoogleOAuthTokenResponse>;

interface RefreshGoogleOAuthTokenOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchToken: TokenFetcher;
  maxAttempts?: number;
  retryDelayMs?: number;
}

export class GoogleOAuthRefreshError extends Error {
  reconnectRequired: boolean;
  cause: unknown;

  constructor(message: string, reconnectRequired: boolean, cause: unknown) {
    super(message);
    this.name = "GoogleOAuthRefreshError";
    this.reconnectRequired = reconnectRequired;
    this.cause = cause;
  }
}

const oauthErrorCode = (error: any): string | undefined =>
  error?.data?.error || error?.response?._data?.error || error?.cause?.data?.error;

const statusCode = (error: any): number | undefined =>
  error?.statusCode || error?.status || error?.response?.status;

const isTransientFailure = (error: unknown): boolean => {
  const status = statusCode(error);
  return status === undefined || status === 408 || status === 429 || status >= 500;
};

const wait = (delayMs: number) =>
  delayMs > 0 ? new Promise<void>((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve();

export async function refreshGoogleOAuthAccessToken({
  clientId,
  clientSecret,
  refreshToken,
  fetchToken,
  maxAttempts = 3,
  retryDelayMs = 200,
}: RefreshGoogleOAuthTokenOptions): Promise<GoogleOAuthTokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }).toString();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchToken("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (error: unknown) {
      if (oauthErrorCode(error) === "invalid_grant") {
        throw new GoogleOAuthRefreshError(
          "Google Drive session expired. Please reconnect.",
          true,
          error,
        );
      }

      if (attempt < maxAttempts && isTransientFailure(error)) {
        await wait(retryDelayMs * attempt);
        continue;
      }

      throw new GoogleOAuthRefreshError(
        "Google Drive is temporarily unavailable. Please try again.",
        false,
        error,
      );
    }
  }

  throw new GoogleOAuthRefreshError(
    "Google Drive is temporarily unavailable. Please try again.",
    false,
    undefined,
  );
}
