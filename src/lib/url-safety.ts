const BLOCKED_HOSTNAME_PATTERNS = [
  /^0\./,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /\.internal$/i,
  /\.local$/i,
  /\.localhost$/i,
  /metadata\.google\.internal/i,
  /169\.254\.169\.254/,
];

const ALLOWED_SKILL_DOMAINS = ["raw.githubusercontent.com"];

const ALLOWED_UPLOAD_HOSTS = new Set([
  "utfs.io",
  "ufs.sh",
  "uploadthing.com",
  "uploadthing-prod.s3.us-west-2.amazonaws.com",
]);

function isBlockedHostname(hostname: string): boolean {
  return BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname));
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isSafeExternalUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (isBlockedHostname(parsed.hostname)) return false;
  return true;
}

export function isValidSkillUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (parsed.protocol !== "https:") return false;
  if (!ALLOWED_SKILL_DOMAINS.includes(parsed.hostname)) return false;
  if (parsed.username || parsed.password) return false;
  if (isBlockedHostname(parsed.hostname)) return false;
  return true;
}

export function isAllowedUploadUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (isBlockedHostname(parsed.hostname)) return false;

  const host = parsed.hostname.toLowerCase();
  if (ALLOWED_UPLOAD_HOSTS.has(host)) return true;
  if (host.endsWith(".ufs.sh")) return true;

  return false;
}

export function filterSafeExternalUrls(urls: string[]): string[] {
  return urls.filter(isSafeExternalUrl);
}

export function filterAllowedUploadUrls(urls: string[]): string[] {
  return urls.filter(isAllowedUploadUrl);
}
