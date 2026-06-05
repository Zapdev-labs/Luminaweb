import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

type Denied = { ok: false; status: 403 | 404 };
type Allowed = { ok: true };

function getInternalKey(): string {
  const key = process.env.POLARIS_CONVEX_INTERNAL_KEY;
  if (!key) {
    throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured");
  }
  return key;
}

export function ownershipDeniedResponse(result: Denied): NextResponse {
  return NextResponse.json(
    { error: result.status === 404 ? "Not found" : "Forbidden" },
    { status: result.status }
  );
}

export async function verifyProjectOwnership(
  convex: ConvexHttpClient,
  projectId: string,
  userId: string
): Promise<Allowed | Denied> {
  const project = await convex.query(api.system.getProjectById, {
    internalKey: getInternalKey(),
    projectId: projectId as Id<"projects">,
  });

  if (!project) {
    return { ok: false, status: 404 };
  }

  if (project.ownerId !== userId) {
    return { ok: false, status: 403 };
  }

  return { ok: true };
}

export async function verifyConversationOwnership(
  convex: ConvexHttpClient,
  conversationId: string,
  userId: string
): Promise<Allowed | Denied> {
  const conversation = await convex.query(api.system.getConversationById, {
    internalKey: getInternalKey(),
    conversationId: conversationId as Id<"conversations">,
  });

  if (!conversation) {
    return { ok: false, status: 404 };
  }

  return verifyProjectOwnership(convex, conversation.projectId, userId);
}
