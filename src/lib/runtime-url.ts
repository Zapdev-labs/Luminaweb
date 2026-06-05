const HTTPS_PROTOCOL = "https://";

function normalizeOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const withProtocol = trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `${HTTPS_PROTOCOL}${trimmed}`;

  try {
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    return undefined;
  }
}

export function getPublicAppOrigin(): string | undefined {
  return (
    normalizeOrigin(process.env.INNGEST_SERVE_ORIGIN) ||
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeOrigin(process.env.RAILWAY_PUBLIC_DOMAIN) ||
    normalizeOrigin(process.env.VERCEL_URL)
  );
}
