import {
  captureException,
  captureMessage,
  flush,
  init,
  setTag,
  type SdkOptions,
} from "@zapdev-labs/sentry-clone";

let initialized = false;

function getOpenSentryDsn(): string | undefined {
  return process.env.NEXT_PUBLIC_OPEN_SENTRY_DSN || process.env.OPEN_SENTRY_DSN;
}

function buildOptions(dsn: string): SdkOptions {
  return {
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || "production",
    release: process.env.NEXT_PUBLIC_APP_VERSION || process.env.RAILWAY_DEPLOYMENT_ID || "unknown",
    sampleRate: Number(process.env.OPEN_SENTRY_SAMPLE_RATE || "1"),
    tracesSampleRate: Number(process.env.OPEN_SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    enableBreadcrumbs: true,
  };
}

export function initOpenSentry(runtime: "browser" | "edge" | "server"): void {
  if (initialized) {
    return;
  }

  const dsn = getOpenSentryDsn();
  if (!dsn) {
    return;
  }

  init(buildOptions(dsn));
  setTag("runtime", runtime);
  initialized = true;
}

export const openSentry = {
  captureException,
  captureMessage,
  flush,
  init: initOpenSentry,
  setTag,
};
