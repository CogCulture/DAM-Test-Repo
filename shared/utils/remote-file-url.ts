export type RemoteUrlValidation =
  | { valid: true; url: string }
  | { valid: false; message: string };

const parseIpv4 = (address: string): number[] | null => {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((part, index) => !Number.isInteger(part) || part < 0 || part > 255 || String(part) !== parts[index])) {
    return null;
  }
  return octets;
};

const isPublicIpv4 = (address: string): boolean => {
  const octets = parseIpv4(address);
  if (!octets) return false;
  const [first, second] = octets;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && (second === 0 || second === 168)) return false;
  if (first === 198 && (second === 18 || second === 19)) return false;
  return true;
};

export const isPublicNetworkAddress = (rawAddress: string): boolean => {
  const address = rawAddress.trim().replace(/^\[|\]$/gu, "").split("%")[0]!.toLocaleLowerCase();
  if (address.includes(".")) {
    const mapped = address.match(/^(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
    return mapped ? isPublicIpv4(mapped) : false;
  }

  if (!address.includes(":")) return false;
  if (address === "::" || address === "::1") return false;
  if (/^(?:fc|fd)/u.test(address)) return false;
  if (/^fe[89ab]/u.test(address)) return false;
  if (/^ff/u.test(address)) return false;
  return /^[0-9a-f:]+$/u.test(address);
};

export const validateRemoteFileUrl = (
  value: string,
  resolvedAddresses: string[],
): RemoteUrlValidation => {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { valid: false, message: "Enter a valid HTTP or HTTPS file URL." };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { valid: false, message: "Only HTTP and HTTPS file URLs are supported." };
  }
  if (url.username || url.password) {
    return { valid: false, message: "File URLs cannot contain embedded credentials." };
  }
  const hostname = url.hostname.toLocaleLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { valid: false, message: "Local network file URLs are not allowed." };
  }
  if (!resolvedAddresses.length || resolvedAddresses.some((address) => !isPublicNetworkAddress(address))) {
    return { valid: false, message: "The file URL resolves to a private or unsafe network address." };
  }

  return { valid: true, url: url.toString() };
};
