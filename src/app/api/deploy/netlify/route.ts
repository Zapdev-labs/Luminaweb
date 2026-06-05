import { createHash } from "crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  ownershipDeniedResponse,
  verifyProjectOwnership,
} from "@/lib/authorize-resource";
import { sanitizeDeployFiles } from "@/lib/deploy-paths";
import { convex } from "@/lib/convex-client";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const requestSchema = z.object({
  projectId: z.string(),
  token: z.string().min(1, "Netlify token is required"),
  files: z.record(z.string(), z.string()),
  existingNetlifySiteId: z.string().optional(),
});

async function readNetlifyError(res: Response): Promise<string> {
  try {
    const body = await res.json() as { message?: string; errors?: string[] };
    return body.message ?? body.errors?.[0] ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export const maxDuration = 300;

export async function POST(request: Request) {
  const { userId, has } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!has({ plan: "pro" })) {
    return NextResponse.json({ error: "Pro plan required" }, { status: 403 });
  }

  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;

  if (!internalKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const { projectId, token, files, existingNetlifySiteId } = parsed.data;

  const ownership = await verifyProjectOwnership(convex, projectId, userId);
  if (!ownership.ok) {
    return ownershipDeniedResponse(ownership);
  }

  const safeFiles = sanitizeDeployFiles(files);
  if (!safeFiles) {
    return NextResponse.json({ error: "Invalid file paths in deployment" }, { status: 400 });
  }

  await convex.mutation(api.system.updateDeploymentStatus, {
    internalKey,
    projectId: projectId as Id<"projects">,
    status: "deploying",
    provider: "netlify",
    deploymentError: undefined,
  });

  try {
    let siteId = existingNetlifySiteId;
    let siteUrl = "";

    if (siteId) {
      const checkRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!checkRes.ok) {
        siteId = undefined;
      } else {
        const site = await checkRes.json() as { url?: string };
        siteUrl = site.url ?? "";
      }
    }

    if (!siteId) {
      const safeName = `polaris-${projectId.slice(-8)}-${Date.now()}`;
      const createRes = await fetch("https://api.netlify.com/api/v1/sites", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: safeName }),
      });

      if (!createRes.ok) {
        const errMsg = await readNetlifyError(createRes);
        throw new Error(errMsg);
      }

      const newSite = await createRes.json() as { id: string; url?: string; ssl_url?: string };
      siteId = newSite.id;
      siteUrl = newSite.ssl_url ?? newSite.url ?? "";
    }

    const fileHashes: Record<string, string> = {};
    const normalizedFiles: Record<string, string> = {};

    for (const [filePath, content] of Object.entries(safeFiles)) {
      const normalized = filePath.startsWith("/") ? filePath : `/${filePath}`;
      const hash = createHash("sha1").update(content).digest("hex");
      fileHashes[normalized] = hash;
      normalizedFiles[normalized] = content;
    }

    const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ files: fileHashes }),
    });

    if (!deployRes.ok) {
      const errMsg = await readNetlifyError(deployRes);
      throw new Error(errMsg);
    }

    const deployData = await deployRes.json() as {
      id: string;
      required?: string[];
      required_functions?: string[];
    };

    const requiredHashes = new Set([
      ...(deployData.required ?? []),
      ...(deployData.required_functions ?? []),
    ]);

    const uploadPromises: Promise<void>[] = [];

    for (const [filePath, content] of Object.entries(normalizedFiles)) {
      const hash = fileHashes[filePath];
      if (!hash || !requiredHashes.has(hash)) continue;

      uploadPromises.push(
        fetch(`https://api.netlify.com/api/v1/deploys/${deployData.id}/files${filePath}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/octet-stream",
          },
          body: content,
        }).then(async (res) => {
          if (!res.ok) {
            const errMsg = await readNetlifyError(res);
            throw new Error(`Failed to upload ${filePath}: ${errMsg}`);
          }
        }),
      );
    }

    await Promise.all(uploadPromises);

    let retries = 0;
    const maxRetries = 60;
    let state = "";

    while (retries < maxRetries) {
      const statusRes = await fetch(`https://api.netlify.com/api/v1/deploys/${deployData.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (statusRes.ok) {
        const status = await statusRes.json() as { state: string };
        state = status.state;

        if (state === "ready" || state === "error") break;
      }

      retries++;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (state === "error") throw new Error("Netlify deployment failed");
    if (retries >= maxRetries) throw new Error("Netlify deployment timed out");

    await convex.mutation(api.system.updateDeploymentStatus, {
      internalKey,
      projectId: projectId as Id<"projects">,
      status: "completed",
      provider: "netlify",
      deploymentUrl: siteUrl,
      deploymentSiteId: siteId,
    });

    return NextResponse.json({
      success: true,
      url: siteUrl,
      netlifySiteId: siteId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deployment failed";

    await convex.mutation(api.system.updateDeploymentStatus, {
      internalKey,
      projectId: projectId as Id<"projects">,
      status: "failed",
      provider: "netlify",
      deploymentError: message,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
