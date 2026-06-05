import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  ownershipDeniedResponse,
  verifyProjectOwnership,
} from "@/lib/authorize-resource";
import { sanitizeDeployFiles } from "@/lib/deploy-paths";
import { convex } from "@/lib/convex-client";
import { getPostHogClient } from "@/lib/posthog-server";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const requestSchema = z.object({
  projectId: z.string(),
  token: z.string().min(1, "Vercel token is required"),
  files: z.record(z.string(), z.string()),
  existingVercelProjectId: z.string().optional(),
  framework: z.string().optional(),
});

function detectFramework(files: Record<string, string>): string {
  const packageJson = files["package.json"];

  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps.next) return "nextjs";
      if (deps["@remix-run/react"]) return "remix";
      if (deps.vite || deps["@vitejs/plugin-react"]) return "vite";
      if (deps["@sveltejs/kit"]) return "sveltekit";
      if (deps.astro) return "astro";
      if (deps["@nuxt/core"] || deps["nuxt"]) return "nuxt";
      if (deps.vue) return "vue";
      if (deps["@angular/core"]) return "angular";
      if (deps.react) return "react";
    } catch {
      // ignore parse errors
    }
  }

  if (files["next.config.js"] || files["next.config.ts"]) return "nextjs";
  if (files["vite.config.js"] || files["vite.config.ts"]) return "vite";
  if (files["svelte.config.js"] || files["svelte.config.ts"]) return "sveltekit";
  if (files["astro.config.js"] || files["astro.config.ts"]) return "astro";
  if (files["nuxt.config.js"] || files["nuxt.config.ts"]) return "nuxt";
  if (files["angular.json"]) return "angular";
  if (files["index.html"]) return "static";

  return "other";
}

const FRAMEWORK_BUILD_DIRS: Record<string, string> = {
  nextjs: ".next",
  react: "dist",
  vite: "dist",
  remix: "public",
  nuxt: ".output",
  sveltekit: "build",
  astro: "dist",
  vue: "dist",
  angular: "dist",
};

const FRAMEWORKS_NEEDING_SOURCE = new Set([
  "nextjs", "react", "vite", "remix", "nuxt", "sveltekit", "astro", "vue", "angular",
]);

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

  const { projectId, token, files, existingVercelProjectId, framework: providedFramework } = parsed.data;

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
    provider: "vercel",
    deploymentError: undefined,
  });

  try {
    const detectedFramework = providedFramework ?? detectFramework(safeFiles);

    let vercelProjectId = existingVercelProjectId;
    let projectName: string | undefined;

    if (!vercelProjectId) {
      const safeName = `polaris-${projectId.slice(-8)}-${Date.now()}`;
      const createRes = await fetch("https://api.vercel.com/v9/projects", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: safeName,
          framework: detectedFramework === "other" || detectedFramework === "static" ? null : detectedFramework,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json() as { error?: { message?: string } };
        throw new Error(err.error?.message ?? "Failed to create Vercel project");
      }

      const newProject = await createRes.json() as { id: string; name: string };
      vercelProjectId = newProject.id;
      projectName = newProject.name;
    } else {
      const projectRes = await fetch(`https://api.vercel.com/v9/projects/${vercelProjectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (projectRes.ok) {
        const p = await projectRes.json() as { name: string };
        projectName = p.name;
      } else {
        vercelProjectId = undefined;
        const safeName = `polaris-${projectId.slice(-8)}-${Date.now()}`;
        const createRes = await fetch("https://api.vercel.com/v9/projects", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: safeName,
            framework: detectedFramework === "other" || detectedFramework === "static" ? null : detectedFramework,
          }),
        });
        if (!createRes.ok) {
          const err = await createRes.json() as { error?: { message?: string } };
          throw new Error(err.error?.message ?? "Failed to create Vercel project");
        }
        const newProject = await createRes.json() as { id: string; name: string };
        vercelProjectId = newProject.id;
        projectName = newProject.name;
      }
    }

    const deploymentFiles = Object.entries(safeFiles).map(([filePath, content]) => ({
      file: filePath.startsWith("/") ? filePath.substring(1) : filePath,
      data: content,
    }));

    const deploymentConfig: Record<string, unknown> = {
      name: projectName,
      project: vercelProjectId,
      target: "production",
      files: deploymentFiles,
    };

    const outputDir = FRAMEWORK_BUILD_DIRS[detectedFramework];
    if (FRAMEWORKS_NEEDING_SOURCE.has(detectedFramework) && outputDir) {
      deploymentConfig.buildCommand = "npm run build";
      deploymentConfig.outputDirectory = outputDir;
    } else {
      deploymentConfig.routes = [{ src: "/(.*)", dest: "/$1" }];
    }

    const deployRes = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(deploymentConfig),
    });

    if (!deployRes.ok) {
      const err = await deployRes.json() as { error?: { message?: string } };
      throw new Error(err.error?.message ?? "Failed to create Vercel deployment");
    }

    const deployData = await deployRes.json() as { id: string };

    let retries = 0;
    const maxRetries = 60;
    let deploymentState = "";
    let deploymentUrl = "";

    while (retries < maxRetries) {
      const statusRes = await fetch(`https://api.vercel.com/v13/deployments/${deployData.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (statusRes.ok) {
        const status = await statusRes.json() as { readyState: string; url?: string };
        deploymentState = status.readyState;
        deploymentUrl = status.url ? `https://${status.url}` : "";

        if (status.readyState === "READY" || status.readyState === "ERROR") break;
      }

      retries++;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (deploymentState === "ERROR") throw new Error("Vercel deployment failed");
    if (retries >= maxRetries) throw new Error("Vercel deployment timed out");

    const liveUrl = projectName ? `https://${projectName}.vercel.app` : deploymentUrl;

    await convex.mutation(api.system.updateDeploymentStatus, {
      internalKey,
      projectId: projectId as Id<"projects">,
      status: "completed",
      provider: "vercel",
      deploymentUrl: liveUrl,
      deploymentProjectId: vercelProjectId,
    });

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: userId,
      event: "deploy_completed",
      properties: {
        project_id: projectId,
        provider: "vercel",
        url: liveUrl,
      },
    });
    await posthog.shutdown();

    return NextResponse.json({
      success: true,
      url: liveUrl,
      vercelProjectId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Deployment failed";

    await convex.mutation(api.system.updateDeploymentStatus, {
      internalKey,
      projectId: projectId as Id<"projects">,
      status: "failed",
      provider: "vercel",
      deploymentError: message,
    });

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: userId,
      event: "deploy_failed",
      properties: {
        project_id: projectId,
        provider: "vercel",
        error: message,
      },
    });
    await posthog.shutdown();

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
