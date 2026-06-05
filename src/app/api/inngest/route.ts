import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { getPublicAppOrigin } from "@/lib/runtime-url";
import { processMessage } from "@/features/conversations/inngest/process-message";
import { importGithubRepo } from "@/features/projects/inngest/import-github-repo";
import { exportToGithub } from "@/features/projects/inngest/export-to-github";
import { importFigma } from "@/features/projects/inngest/import-figma";
import { repoResearchWorker } from "@/features/conversations/inngest/workers/repo-research";
import { exaResearchWorker } from "@/features/conversations/inngest/workers/exa-research";
import { reviewWorker } from "@/features/conversations/inngest/workers/review";
import { validateBuild } from "@/features/conversations/inngest/validate-build";

export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  serveOrigin: getPublicAppOrigin(),
  servePath: "/api/inngest",
  functions: [
    processMessage,
    importGithubRepo,
    exportToGithub,
    importFigma,
    repoResearchWorker,
    exaResearchWorker,
    reviewWorker,
    validateBuild,
  ],
});
