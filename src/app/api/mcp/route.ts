import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod/v3";

import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

// ---------------------------------------------------------------------------
// Security constants
// ---------------------------------------------------------------------------

/** Must match the format generated in keys/route.ts */
const API_KEY_REGEX = /^pk_[A-Za-z0-9]{32}$/;

/** Max JSON body the transport will receive (MCP messages are small) */
const MAX_BODY_BYTES = 512_000; // 512 KB

/** Max characters in file content for write/create tools */
const MAX_FILE_CONTENT_CHARS = 500_000; // ~500 KB of text

/** Max file/folder name length */
const MAX_NAME_LENGTH = 255;

/** Max Convex ID length (Convex IDs are base32, ~36 chars) */
const MAX_ID_LENGTH = 64;

// ---------------------------------------------------------------------------
// In-memory rate limiter (per serverless instance — first line of defense)
// ---------------------------------------------------------------------------

interface RateLimitState {
  /** General request count this window */
  count: number;
  windowStart: number;
  /** Auth failure count this window (triggers longer lockout) */
  failCount: number;
  failWindowStart: number;
}

const rateLimiter = new Map<string, RateLimitState>();

const WINDOW_MS = 60_000;        // 1-minute rolling window
const MAX_REQUESTS = 60;          // 60 req/min per IP
const FAIL_WINDOW_MS = 600_000;  // 10-minute window for auth failures
const MAX_AUTH_FAILURES = 10;     // 10 bad auth attempts → lockout for 10 min

function pruneRateLimiter() {
  const now = Date.now();
  for (const [ip, state] of rateLimiter) {
    if (
      now - state.windowStart > WINDOW_MS &&
      now - state.failWindowStart > FAIL_WINDOW_MS
    ) {
      rateLimiter.delete(ip);
    }
  }
}

function checkRateLimit(ip: string): boolean {
  // Opportunistic cleanup — avoid unbounded memory growth
  if (rateLimiter.size > 5_000) pruneRateLimiter();

  const now = Date.now();
  let state = rateLimiter.get(ip);

  if (!state) {
    state = { count: 0, windowStart: now, failCount: 0, failWindowStart: now };
    rateLimiter.set(ip, state);
  }

  // Reset counters when windows expire
  if (now - state.windowStart >= WINDOW_MS) {
    state.count = 0;
    state.windowStart = now;
  }
  if (now - state.failWindowStart >= FAIL_WINDOW_MS) {
    state.failCount = 0;
    state.failWindowStart = now;
  }

  // Auth failure lockout takes priority
  if (state.failCount >= MAX_AUTH_FAILURES) return false;

  // General request rate limit
  if (state.count >= MAX_REQUESTS) return false;

  state.count++;
  return true;
}

function recordAuthFailure(ip: string) {
  const state = rateLimiter.get(ip);
  if (state) state.failCount++;
}

function getClientIp(req: Request): string {
  // Trust Vercel/Cloudflare forwarded header; take only the first IP to
  // prevent spoofing via crafted X-Forwarded-For chains.
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store, private",
  "Access-Control-Allow-Origin":
    process.env.POLARIS_MCP_ALLOWED_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://luminaweb.app",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-api-key, mcp-session-id, mcp-protocol-version, Accept",
};

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
  });
}

function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ---------------------------------------------------------------------------
// Input validation schemas
// ---------------------------------------------------------------------------

const idSchema = z
  .string()
  .min(1, "ID cannot be empty")
  .max(MAX_ID_LENGTH, "ID too long");

const fileNameSchema = z
  .string()
  .min(1, "Name cannot be empty")
  .max(MAX_NAME_LENGTH, `Name too long (max ${MAX_NAME_LENGTH} chars)`)
  .refine((n) => !n.includes(".."), "Name cannot contain '..'")
  .refine((n) => !/[\x00-\x1f\x7f]/.test(n), "Name cannot contain control characters");

const contentSchema = z
  .string()
  .max(MAX_FILE_CONTENT_CHARS, `Content too large (max ${MAX_FILE_CONTENT_CHARS} chars)`);

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

async function authenticate(
  req: Request,
  clientIp: string
): Promise<{ clerkUserId: string; internalKey: string } | Response> {
  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;
  if (!internalKey) {
    console.error("[Polaris MCP] POLARIS_CONVEX_INTERNAL_KEY not configured");
    return errorResponse("Service unavailable", 503);
  }

  const rawKey = req.headers.get("x-api-key");

  // Validate format before any network call — prevents DoS via crafted keys
  if (!rawKey || !API_KEY_REGEX.test(rawKey)) {
    recordAuthFailure(clientIp);
    return errorResponse("Unauthorized", 401);
  }

  let keyData: { clerkUserId: string; keyId: string } | null = null;
  try {
    const keyHash = await hashKey(rawKey);
    keyData = await convex.query(api.system.validateApiKey, { internalKey, keyHash });
  } catch {
    // Don't expose Convex internals
    return errorResponse("Service unavailable", 503);
  }

  if (!keyData) {
    recordAuthFailure(clientIp);
    // Same message for "key not found" and "bad format" — don't leak which
    return errorResponse("Unauthorized", 401);
  }

  return { clerkUserId: keyData.clerkUserId, internalKey };
}

// ---------------------------------------------------------------------------
// Ownership verification (always verify — never trust client-supplied IDs)
// ---------------------------------------------------------------------------

async function verifyProjectOwnership(
  projectId: string,
  clerkUserId: string,
  internalKey: string
) {
  try {
    const project = await convex.query(api.system.getProjectById, {
      internalKey,
      projectId: projectId as Id<"projects">,
    });
    if (!project || project.ownerId !== clerkUserId) return null;
    return project;
  } catch {
    return null;
  }
}

async function verifyFileOwnership(
  fileId: string,
  clerkUserId: string,
  internalKey: string
) {
  try {
    const file = await convex.query(api.system.getFileById, {
      internalKey,
      fileId: fileId as Id<"files">,
    });
    if (!file) return null;
    const project = await verifyProjectOwnership(file.projectId, clerkUserId, internalKey);
    if (!project) return null;
    return file;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tool result helpers
// ---------------------------------------------------------------------------

type ToolResult = { content: [{ type: "text"; text: string }]; isError?: boolean };

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

/** Sanitized error — never leaks Convex internals. Log actual error server-side. */
function toolErr(userMessage: string, internalError?: unknown): ToolResult {
  if (internalError !== undefined) {
    console.error("[Polaris MCP] Tool error:", internalError);
  }
  return { content: [{ type: "text", text: userMessage }], isError: true };
}

// ---------------------------------------------------------------------------
// MCP server construction
// ---------------------------------------------------------------------------

function buildMcpServer(clerkUserId: string, internalKey: string): McpServer {
  const server = new McpServer({ name: "polaris", version: "1.0.0" });

  // Wrapper to avoid TS2589 with zod/v3 + MCP SDK generic inference
  const registerTool = (
    name: string,
    config: unknown,
    cb: (args: any) => any
  ) => {
    return (server as any).registerTool(name, config, cb);
  };

  // ── list_projects ──────────────────────────────────────────────────────────
  registerTool(
    "list_projects",
    { description: "List all Polaris projects belonging to the authenticated user" },
    async () => {
      try {
        const projects = await convex.query(api.system.getProjectsByOwner, {
          internalKey,
          clerkUserId,
        });
        return ok(
          JSON.stringify(
            projects.map((p) => ({
              id: p._id,
              name: p.name,
              updatedAt: p.updatedAt,
              deploymentUrl: p.deploymentUrl ?? null,
              deploymentStatus: p.deploymentStatus ?? null,
            })),
            null,
            2
          )
        );
      } catch (e) {
        return toolErr("Failed to list projects. Please try again.", e);
      }
    }
  );

  // ── list_files ─────────────────────────────────────────────────────────────
  registerTool(
    "list_files",
    {
      description:
        "List all files and folders in a project. Returns id, name, type (file/folder), and parentId. Items with parentId null are at root level.",
      inputSchema: { projectId: idSchema.describe("The project ID") },
    },
    async ({ projectId }) => {
      const project = await verifyProjectOwnership(projectId, clerkUserId, internalKey);
      if (!project) return toolErr("Project not found or access denied");
      try {
        const files = await convex.query(api.system.getProjectFiles, {
          internalKey,
          projectId: projectId as Id<"projects">,
        });
        const sorted = [...files].sort((a, b) => {
          if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        return ok(
          JSON.stringify(
            sorted.map((f) => ({
              id: f._id,
              name: f.name,
              type: f.type,
              parentId: f.parentId ?? null,
            })),
            null,
            2
          )
        );
      } catch (e) {
        return toolErr("Failed to list files. Please try again.", e);
      }
    }
  );

  // ── read_file ──────────────────────────────────────────────────────────────
  registerTool(
    "read_file",
    {
      description: "Read the content of a file",
      inputSchema: { fileId: idSchema.describe("The file ID from list_files") },
    },
    async ({ fileId }) => {
      const file = await verifyFileOwnership(fileId, clerkUserId, internalKey);
      if (!file) return toolErr("File not found or access denied");
      if (file.type === "folder")
        return toolErr("Cannot read a folder. Use list_files to browse contents.");
      return ok(file.content ?? "");
    }
  );

  // ── write_file ─────────────────────────────────────────────────────────────
  registerTool(
    "write_file",
    {
      description: "Update the content of an existing file",
      inputSchema: {
        fileId: idSchema.describe("The file ID from list_files"),
        content: contentSchema.describe("The new file content"),
      },
    },
    async ({ fileId, content }) => {
      const file = await verifyFileOwnership(fileId, clerkUserId, internalKey);
      if (!file) return toolErr("File not found or access denied");
      if (file.type === "folder") return toolErr("Cannot write to a folder");
      try {
        await convex.mutation(api.system.updateFile, {
          internalKey,
          fileId: fileId as Id<"files">,
          content,
        });
        return ok(`File "${file.name}" updated successfully`);
      } catch (e) {
        return toolErr("Failed to write file. Please try again.", e);
      }
    }
  );

  // ── create_file ────────────────────────────────────────────────────────────
  registerTool(
    "create_file",
    {
      description:
        "Create a new file in a project. The name can include a relative path like 'src/index.css'.",
      inputSchema: {
        projectId: idSchema.describe("The project ID"),
        name: fileNameSchema.describe(
          "File name or relative path, e.g. 'index.html' or 'src/app.tsx'"
        ),
        content: contentSchema.describe("The file content"),
        parentId: idSchema
          .optional()
          .describe("Optional parent folder ID. Omit for root level."),
      },
    },
    async ({ projectId, name, content, parentId }) => {
      const project = await verifyProjectOwnership(projectId, clerkUserId, internalKey);
      if (!project) return toolErr("Project not found or access denied");
      try {
        const fileId = await convex.mutation(api.system.createFile, {
          internalKey,
          projectId: projectId as Id<"projects">,
          name,
          content,
          parentId: parentId ? (parentId as Id<"files">) : undefined,
        });
        return ok(`File created with ID: ${fileId}`);
      } catch (e) {
        return toolErr("Failed to create file. It may already exist.", e);
      }
    }
  );

  // ── create_folder ──────────────────────────────────────────────────────────
  registerTool(
    "create_folder",
    {
      description: "Create a new folder in a project",
      inputSchema: {
        projectId: idSchema.describe("The project ID"),
        name: fileNameSchema.describe("Folder name"),
        parentId: idSchema
          .optional()
          .describe("Optional parent folder ID. Omit for root level."),
      },
    },
    async ({ projectId, name, parentId }) => {
      const project = await verifyProjectOwnership(projectId, clerkUserId, internalKey);
      if (!project) return toolErr("Project not found or access denied");
      try {
        const folderId = await convex.mutation(api.system.createFolder, {
          internalKey,
          projectId: projectId as Id<"projects">,
          name,
          parentId: parentId ? (parentId as Id<"files">) : undefined,
        });
        return ok(`Folder created with ID: ${folderId}`);
      } catch (e) {
        return toolErr("Failed to create folder. It may already exist.", e);
      }
    }
  );

  // ── delete_file ────────────────────────────────────────────────────────────
  registerTool(
    "delete_file",
    {
      description: "Delete a file or folder. Folders are deleted recursively.",
      inputSchema: {
        fileId: idSchema.describe("The file or folder ID from list_files"),
      },
    },
    async ({ fileId }) => {
      const file = await verifyFileOwnership(fileId, clerkUserId, internalKey);
      if (!file) return toolErr("File not found or access denied");
      try {
        await convex.mutation(api.system.deleteFile, {
          internalKey,
          fileId: fileId as Id<"files">,
        });
        return ok(`Deleted ${file.type} "${file.name}" successfully`);
      } catch (e) {
        return toolErr("Failed to delete. Please try again.", e);
      }
    }
  );

  // ── rename_file ────────────────────────────────────────────────────────────
  registerTool(
    "rename_file",
    {
      description: "Rename a file or folder",
      inputSchema: {
        fileId: idSchema.describe("The file or folder ID from list_files"),
        newName: fileNameSchema.describe("The new name (not a path — just the filename)"),
      },
    },
    async ({ fileId, newName }) => {
      const file = await verifyFileOwnership(fileId, clerkUserId, internalKey);
      if (!file) return toolErr("File not found or access denied");
      try {
        await convex.mutation(api.system.renameFile, {
          internalKey,
          fileId: fileId as Id<"files">,
          newName,
        });
        return ok(`Renamed "${file.name}" to "${newName}" successfully`);
      } catch (e) {
        return toolErr("Failed to rename. The name may already be in use.", e);
      }
    }
  );

  // ── get_project_status ─────────────────────────────────────────────────────
  registerTool(
    "get_project_status",
    {
      description:
        "Get project metadata: name, file count, deployment status, and deployment URL",
      inputSchema: { projectId: idSchema.describe("The project ID") },
    },
    async ({ projectId }) => {
      const project = await verifyProjectOwnership(projectId, clerkUserId, internalKey);
      if (!project) return toolErr("Project not found or access denied");
      try {
        const files = await convex.query(api.system.getProjectFiles, {
          internalKey,
          projectId: projectId as Id<"projects">,
        });
        return ok(
          JSON.stringify(
            {
              id: projectId,
              name: project.name,
              fileCount: files.filter((f) => f.type === "file").length,
              folderCount: files.filter((f) => f.type === "folder").length,
              deploymentStatus: project.deploymentStatus ?? null,
              deploymentUrl: project.deploymentUrl ?? null,
              deploymentProvider: project.deploymentProvider ?? null,
            },
            null,
            2
          )
        );
      } catch (e) {
        return toolErr("Failed to get project status. Please try again.", e);
      }
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: SECURITY_HEADERS });
}

async function handleMcp(req: Request): Promise<Response> {
  const clientIp = getClientIp(req);

  // Rate limit check before any processing
  if (!checkRateLimit(clientIp)) {
    return errorResponse("Too many requests. Try again later.", 429);
  }

  // Authenticate every request (including initialize handshake)
  const authResult = await authenticate(req, clientIp);
  if (authResult instanceof Response) return authResult;

  const { clerkUserId, internalKey } = authResult;

  // For POST: read the body ourselves so we can enforce size limits.
  // We pass it as parsedBody to the transport so it doesn't try to read it again.
  let parsedBody: unknown = undefined;
  if (req.method === "POST") {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return errorResponse("Request body too large", 413);
    }
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return errorResponse("Request body too large", 413);
    }
    try {
      parsedBody = JSON.parse(raw);
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
  }

  const server = buildMcpServer(clerkUserId, internalKey);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no sessions to track
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    const response = await transport.handleRequest(
      req,
      parsedBody !== undefined ? { parsedBody } : undefined
    );
    return addSecurityHeaders(response);
  } finally {
    await server.close();
  }
}

export const maxDuration = 60;

export const GET = handleMcp;
export const POST = handleMcp;
export const DELETE = handleMcp;
