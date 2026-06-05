import { ConvexHttpClient } from "convex/browser";

function getConvexUrl() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }

  return url;
}

export const convex = new ConvexHttpClient(getConvexUrl());
