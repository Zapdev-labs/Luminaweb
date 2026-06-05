import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}

const validateInternalKey = (key: string) => {
  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;

  if (!internalKey) {
    throw new Error("POLARIS_CONVEX_INTERNAL_KEY is not configured");
  }

  if (!timingSafeEqual(key, internalKey)) {
    throw new Error("Invalid internal key");
  }
};

export const getConversationById = query({
  args: {
    conversationId: v.id("conversations"),
    internalKey: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db.get(args.conversationId);
  },
});

export const getProjectById = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);
    return await ctx.db.get(args.projectId);
  },
});

export const createMessage = mutation({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    status: v.optional(
      v.union(
        v.literal("processing"),
        v.literal("completed"),
        v.literal("cancelled")
      )
    ),
    imageUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      projectId: args.projectId,
      role: args.role,
      content: args.content,
      status: args.status,
      imageUrls: args.imageUrls,
    });

    // Update conversation's updatedAt
    await ctx.db.patch(args.conversationId, {
      updatedAt: Date.now(),
    });

    return messageId;
  },
});

export const updateMessageContent = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    content: v.string(),
    toolCalls: v.optional(
      v.array(
        v.object({
          toolName: v.string(),
          label: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    await ctx.db.patch(args.messageId, {
      content: args.content,
      status: "completed" as const,
      ...(args.toolCalls !== undefined && { toolCalls: args.toolCalls }),
    });
  },
});

export const updateMessageStatus = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    status: v.union(
      v.literal("processing"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    await ctx.db.patch(args.messageId, {
      status: args.status,
    });
  },
});

export const appendToolCall = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    toolName: v.string(),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error(`Message ${args.messageId} not found`);
    }

    const existingToolCalls = message.toolCalls ?? [];
    await ctx.db.patch(args.messageId, {
      toolCalls: [...existingToolCalls, { toolName: args.toolName, label: args.label }],
    });
  },
});

export const getProcessingMessages = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db
      .query("messages")
      .withIndex("by_project_status", (q) =>
        q
          .eq("projectId", args.projectId)
          .eq("status", "processing")
      )
      .collect();
  },
});

// Used for Agent conversation context
export const getRecentMessages = query({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();

    const limit = args.limit ?? 10;
    return messages.slice(-limit);
  },
});

// Used for Agent to update conversation title
export const updateConversationTitle = mutation({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
    title: v.string(),
  },
   handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    await ctx.db.patch(args.conversationId, {
      title: args.title,
      updatedAt: Date.now(),
    });
   },
});

// Used for Agent "ListFiles" tool
export const getProjectFiles = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

// Used for Agent "ReadFiles" tool
export const getFileById = query({
  args: {
    internalKey: v.string(),
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db.get(args.fileId);
  },
});

// Used for Agent "UpdateFile" tool
export const updateFile = mutation({
  args: {
    internalKey: v.string(),
    fileId: v.id("files"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const file = await ctx.db.get(args.fileId);

    if (!file) {
      throw new Error("File not found");
    }

    await ctx.db.patch(args.fileId, {
      content: args.content,
      updatedAt: Date.now(),
    });

    return args.fileId;
  },
});

// Used for Agent "CreateFile" tool
export const createFile = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    name: v.string(),
    content: v.string(),
    parentId: v.optional(v.id("files")),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId)
      )
      .collect();

    const existing = files.find(
      (file) => file.name === args.name && file.type === "file"
    );

    if (existing) {
      throw new Error("File already exists");
    }

    const fileId = await ctx.db.insert("files", {
      projectId: args.projectId,
      name: args.name,
      content: args.content,
      type: "file",
      parentId: args.parentId,
      updatedAt: Date.now(),
    });

    return fileId;
  },
});

// Used for Agent bulk "CreateFiles" tool
export const createFiles = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    files: v.array(
      v.object({
        name: v.string(),
        content: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const existingFiles = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId)
      )
      .collect();

    const results: { name: string; fileId: string; error?: string }[] = [];

    for (const file of args.files) {
      const existing = existingFiles.find(
        (f) => f.name === file.name && f.type === "file"
      );

      if (existing) {
        results.push({
          name: file.name,
          fileId: existing._id,
          error: "File already exists",
        });
        continue;
      }

      const fileId = await ctx.db.insert("files", {
        projectId: args.projectId,
        name: file.name,
        content: file.content,
        type: "file",
        parentId: args.parentId,
        updatedAt: Date.now(),
      });

      results.push({ name: file.name, fileId });
    }

    return results;
  },
});

// Used for Agent "CreateFolder" tool
export const createFolder = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    name: v.string(),
    parentId: v.optional(v.id("files")),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId)
      )
      .collect();

    const existing = files.find(
      (file) => file.name === args.name && file.type === "folder"
    );

    if (existing) {
      return existing._id;
    }

    const fileId = await ctx.db.insert("files", {
      projectId: args.projectId,
      name: args.name,
      type: "folder",
      parentId: args.parentId,
      updatedAt: Date.now(),
    });

    return fileId;
  },
});

// Used for Agent "RenameFile" tool
export const renameFile = mutation({
  args: {
    internalKey: v.string(),
    fileId: v.id("files"),
    newName: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("File not found");
    }

    // Check if a file with the new name already exists in the same parent folder
    const siblings = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", file.projectId).eq("parentId", file.parentId)
      )
      .collect();

    const existing = siblings.find(
      (sibling) =>
        sibling.name === args.newName &&
        sibling.type === file.type &&
        sibling._id !== args.fileId
    );

    if (existing) {
      throw new Error(`A ${file.type} named "${args.newName}" already exists`);
    }

    await ctx.db.patch(args.fileId, {
      name: args.newName,
      updatedAt: Date.now(),
    });

    return args.fileId;
  },
});

// Used for Agent "DeleteFile" tool
export const deleteFile = mutation({
  args: {
    internalKey: v.string(),
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

     const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("File not found");
    }

    await ctx.scheduler.runAfter(0, internal.actions.deleteRecursiveAction, {
      fileId: args.fileId,
    });

    return args.fileId;
  },
});

export const cleanup = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const files = await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const file of files) {
      // Delete storage file if it exists
      if (file.storageId) {
        await ctx.storage.delete(file.storageId);
      }

      await ctx.db.delete(file._id);
    }

    return { deleted: files.length };
  },
});

export const generateUploadUrl = mutation({
  args: {
    internalKey: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);
    return await ctx.storage.generateUploadUrl();
  },
});

export const createBinaryFile = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    name: v.string(),
    storageId: v.id("_storage"),
    parentId: v.optional(v.id("files")),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId)
      )
      .collect();

    const existing = files.find(
      (file) => file.name === args.name && file.type === "file"
    );

    if (existing) {
      throw new Error("File already exists");
    }

    const fileId = await ctx.db.insert("files", {
      projectId: args.projectId,
      name: args.name,
      type: "file",
      storageId: args.storageId,
      parentId: args.parentId,
      updatedAt: Date.now(),
    });
    
    return fileId;
  },
});

export const updateImportStatus = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    status: v.optional(
      v.union(
        v.literal("importing"),
        v.literal("completed"),
        v.literal("failed")
      )
    ),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    await ctx.db.patch("projects", args.projectId, {
      importStatus: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const updateDeploymentStatus = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    status: v.optional(
      v.union(
        v.literal("deploying"),
        v.literal("completed"),
        v.literal("failed"),
      )
    ),
    provider: v.optional(
      v.union(v.literal("vercel"), v.literal("netlify")),
    ),
    deploymentUrl: v.optional(v.string()),
    deploymentProjectId: v.optional(v.string()),
    deploymentSiteId: v.optional(v.string()),
    deploymentError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    await ctx.db.patch(args.projectId, {
      deploymentStatus: args.status,
      deploymentProvider: args.provider,
      deploymentUrl: args.deploymentUrl,
      deploymentProjectId: args.deploymentProjectId,
      deploymentSiteId: args.deploymentSiteId,
      deploymentError: args.deploymentError,
      updatedAt: Date.now(),
    });
  },
});

export const updateExportStatus = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    status: v.optional(
      v.union(
        v.literal("exporting"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled")
      )
    ),
    repoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    await ctx.db.patch("projects", args.projectId, {
      exportStatus: args.status,
      exportRepoUrl: args.repoUrl,
      updatedAt: Date.now(),
    });
  },
});

export const getProjectFilesWithUrls = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const files = await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return await Promise.all(
      files.map(async (file) => {
        if (file.storageId) {
          const url = await ctx.storage.getUrl(file.storageId);
          return { ...file, storageUrl: url };
        }
        return { ...file, storageUrl: null };
      })
    );
  },
});

export const createProject = mutation({
  args: {
    internalKey: v.string(),
    name: v.string(),
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      ownerId: args.ownerId,
      updatedAt: Date.now(),
      importStatus: "importing",
    });

    return projectId;
  },
});

export const getProjectsByOwner = query({
  args: {
    internalKey: v.string(),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);
    return await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.clerkUserId))
      .order("desc")
      .collect();
  },
});

export const validateApiKey = query({
  args: {
    internalKey: v.string(),
    keyHash: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);
    const key = await ctx.db
      .query("api_keys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", args.keyHash))
      .first();
    return key ? { clerkUserId: key.clerkUserId, keyId: key._id } : null;
  },
});

export const createApiKey = mutation({
  args: {
    internalKey: v.string(),
    clerkUserId: v.string(),
    name: v.string(),
    keyHash: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);
    const id = await ctx.db.insert("api_keys", {
      keyHash: args.keyHash,
      clerkUserId: args.clerkUserId,
      name: args.name,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const listApiKeys = query({
  args: {
    internalKey: v.string(),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);
    const keys = await ctx.db
      .query("api_keys")
      .withIndex("by_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .collect();
    return keys.map((k) => ({ id: k._id, name: k.name, createdAt: k.createdAt }));
  },
});

export const revokeApiKey = mutation({
  args: {
    internalKey: v.string(),
    keyId: v.id("api_keys"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);
    const key = await ctx.db.get(args.keyId);
    if (!key) throw new Error("API key not found");
    if (key.clerkUserId !== args.clerkUserId) throw new Error("Unauthorized");
    await ctx.db.delete(args.keyId);
    return args.keyId;
  },
});

export const createRunArtifact = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    workerType: v.union(
      v.literal("repo_research"),
      v.literal("exa_research"),
      v.literal("review"),
    ),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    summary: v.optional(v.string()),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const existing = await ctx.db
      .query("agent_run_artifacts")
      .withIndex("by_message_worker", (q) =>
        q.eq("messageId", args.messageId).eq("workerType", args.workerType)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        summary: args.summary,
        payload: args.payload,
        ...(args.status === "running" ? { startedAt: Date.now() } : {}),
        ...(args.status === "completed" || args.status === "failed"
          ? { completedAt: Date.now() }
          : {}),
      });
      return existing._id;
    }

    return await ctx.db.insert("agent_run_artifacts", {
      messageId: args.messageId,
      workerType: args.workerType,
      status: args.status,
      summary: args.summary,
      payload: args.payload,
      startedAt: args.status === "running" ? Date.now() : undefined,
      completedAt: args.status === "completed" ? Date.now() : undefined,
      createdAt: Date.now(),
    });
  },
});

export const getRunArtifacts = query({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db
      .query("agent_run_artifacts")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .collect();
  },
});

export const getBuildValidation = query({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db
      .query("build_validations")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .first();
  },
});

export const getBuildValidationsByProject = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db
      .query("build_validations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(10);
  },
});

export const createBuildValidation = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    projectId: v.id("projects"),
    command: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const existing = await ctx.db
      .query("build_validations")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("build_validations", {
      messageId: args.messageId,
      projectId: args.projectId,
      status: "pending",
      command: args.command,
      createdAt: Date.now(),
    });
  },
});

export const updateBuildValidationStatus = mutation({
  args: {
    internalKey: v.string(),
    buildValidationId: v.id("build_validations"),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("passed"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    exitCode: v.optional(v.number()),
    output: v.optional(v.string()),
    errorOutput: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const update: Record<string, unknown> = {
      status: args.status,
    };

    if (args.exitCode !== undefined) update.exitCode = args.exitCode;
    if (args.output !== undefined) update.output = args.output;
    if (args.errorOutput !== undefined) update.errorOutput = args.errorOutput;
    if (args.durationMs !== undefined) update.durationMs = args.durationMs;

    if (args.status === "running") {
      update.startedAt = Date.now();
    } else if (args.status === "passed" || args.status === "failed" || args.status === "skipped") {
      update.completedAt = Date.now();
    }

    await ctx.db.patch(args.buildValidationId, update);
  },
});

export const createProjectWithConversation = mutation({
  args: {
    internalKey: v.string(),
    projectName: v.string(),
    conversationTitle: v.string(),
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const now = Date.now();

    const projectId = await ctx.db.insert("projects", {
      name: args.projectName,
      ownerId: args.ownerId,
      updatedAt: now,
    });

    const conversationId = await ctx.db.insert("conversations", {
      projectId,
      title: args.conversationTitle,
      updatedAt: now,
    });

    return { projectId, conversationId };
  },
});
