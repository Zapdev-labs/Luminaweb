import { describe, it, expect, mock, beforeEach } from "bun:test";
import { z } from "zod";

const capturedCalls: Array<{ modelId: string; prompt: string }> = [];
let mockGenerateTextResult: { text: string } = { text: "{}" };

mock.module("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible:
    (config: { name: string; apiKey?: string; baseURL: string }) =>
    (modelId: string) => ({
      modelId,
      provider: config.name,
      baseURL: config.baseURL,
    }),
}));

mock.module("ai", () => ({
  generateText: async (opts: {
    model: { modelId: string };
    prompt: string;
  }) => {
    capturedCalls.push({ modelId: opts.model.modelId, prompt: opts.prompt });
    return mockGenerateTextResult;
  },
}));

let mockUserId: string | null = "test-user-123";
mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockUserId }),
}));

mock.module("@/lib/firecrawl", () => ({
  firecrawl: {
    scrape: async () => ({ markdown: "mocked documentation" }),
  },
}));

mock.module("@sentry/nextjs", () => ({
  init: () => {},
  captureException: () => {},
  startSpan: (_: unknown, cb: () => unknown) => cb(),
}));

mock.module("@/inngest/client", () => ({
  inngest: {
    createFunction: (
      _config: unknown,
      _trigger: unknown,
      handler: unknown,
    ) => handler,
  },
}));

const suggestionMod = await import("@/app/api/suggestion/route");
const quickEditMod = await import("@/app/api/quick-edit/route");

const suggestionSchema = z.object({
  suggestion: z
    .string()
    .describe(
      "The code to insert at cursor, or empty string if no completion needed",
    ),
});

const quickEditSchema = z.object({
  editedCode: z
    .string()
    .describe(
      "The edited version of the selected code based on the instruction",
    ),
});

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function responseJson(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  capturedCalls.length = 0;
  mockUserId = "test-user-123";
  mockGenerateTextResult = { text: "{}" };
});

describe("OpenRouter Model Configuration", () => {
  it("suggestion route uses qwen/qwen3-coder-next", async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({ suggestion: "console.log" }),
    };

    const req = jsonRequest({
      fileName: "test.ts",
      code: "const x = 1;",
      currentLine: "const x = ",
      previousLines: "",
      textBeforeCursor: "const x = ",
      textAfterCursor: "",
      nextLines: "",
      lineNumber: 1,
    });

    await suggestionMod.POST(req);

    expect(capturedCalls.length).toBeGreaterThanOrEqual(1);
    expect(capturedCalls[0].modelId).toBe("qwen/qwen3-coder-next");
  });

  it("quick-edit route uses qwen/qwen3-coder-next", async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({ editedCode: "const y = 2;" }),
    };

    const req = jsonRequest({
      selectedCode: "const x = 1;",
      fullCode: "const x = 1;\nconsole.log(x);",
      instruction: "rename x to y",
    });

    await quickEditMod.POST(req);

    expect(capturedCalls.length).toBeGreaterThanOrEqual(1);
    expect(capturedCalls[0].modelId).toBe("qwen/qwen3-coder-next");
  });

  it("conversation generation defaults to Minimax M3", async () => {
    const source = await Bun.file(
      "src/lib/ai-models.ts",
    ).text();
    expect(source).toContain("process.env.POLARIS_CODING_MODEL");
    expect(source).toContain("minimax/minimax-m3");
  });

  it("all routes configure OpenRouter with correct baseURL", async () => {
    const files = [
      "src/app/api/suggestion/route.ts",
      "src/app/api/quick-edit/route.ts",
      "src/inngest/functions.ts",
    ];

    for (const file of files) {
      const source = await Bun.file(file).text();
      expect(source).toContain("https://openrouter.ai/api/v1");
      expect(source).toContain("process.env.OPENROUTER_API_KEY");
    }
  });
});

describe("Suggestion JSON Parsing", () => {
  it("parses valid suggestion response", async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({ suggestion: "console.log('hello');" }),
    };

    const req = jsonRequest({
      fileName: "test.ts",
      code: "// test",
      currentLine: "",
      previousLines: "",
      textBeforeCursor: "",
      textAfterCursor: "",
      nextLines: "",
      lineNumber: 1,
    });

    const res = await suggestionMod.POST(req);
    const data = await responseJson(res);

    expect(res.status).toBe(200);
    expect(data.suggestion).toBe("console.log('hello');");
  });

  it("parses empty suggestion (no completion needed)", async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({ suggestion: "" }),
    };

    const req = jsonRequest({
      fileName: "test.ts",
      code: "const x = 1;",
      currentLine: "const x = 1;",
      previousLines: "",
      textBeforeCursor: "const x = 1;",
      textAfterCursor: "",
      nextLines: "",
      lineNumber: 1,
    });

    const res = await suggestionMod.POST(req);
    const data = await responseJson(res);

    expect(res.status).toBe(200);
    expect(data.suggestion).toBe("");
  });

  it("handles invalid JSON from model gracefully", async () => {
    mockGenerateTextResult = { text: "not valid json {{{" };

    const req = jsonRequest({
      fileName: "test.ts",
      code: "// test",
      currentLine: "",
      previousLines: "",
      textBeforeCursor: "",
      textAfterCursor: "",
      nextLines: "",
      lineNumber: 1,
    });

    const res = await suggestionMod.POST(req);
    expect(res.status).toBe(500);

    const data = await responseJson(res);
    expect(data.error).toBe("Failed to generate suggestion");
  });

  it("handles JSON missing required 'suggestion' field", async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({ wrongField: "value" }),
    };

    const req = jsonRequest({
      fileName: "test.ts",
      code: "// test",
      currentLine: "",
      previousLines: "",
      textBeforeCursor: "",
      textAfterCursor: "",
      nextLines: "",
      lineNumber: 1,
    });

    const res = await suggestionMod.POST(req);
    expect(res.status).toBe(500);
  });

  it("schema rejects non-string suggestion", () => {
    expect(() =>
      suggestionSchema.parse({ suggestion: 123 }),
    ).toThrow();
  });
});

describe("Quick Edit JSON Parsing", () => {
  it("parses valid quick-edit response", async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({ editedCode: "const y = 2;" }),
    };

    const req = jsonRequest({
      selectedCode: "const x = 1;",
      fullCode: "const x = 1;",
      instruction: "rename x to y",
    });

    const res = await quickEditMod.POST(req);
    const data = await responseJson(res);

    expect(res.status).toBe(200);
    expect(data.editedCode).toBe("const y = 2;");
  });

  it("handles multi-line edited code", async () => {
    const multiLineCode = "function greet(name: string) {\n  return `Hello, ${name}!`;\n}";
    mockGenerateTextResult = {
      text: JSON.stringify({ editedCode: multiLineCode }),
    };

    const req = jsonRequest({
      selectedCode: "function greet() { return 'hi'; }",
      fullCode: "function greet() { return 'hi'; }",
      instruction: "add name parameter",
    });

    const res = await quickEditMod.POST(req);
    const data = await responseJson(res);

    expect(res.status).toBe(200);
    expect(data.editedCode).toBe(multiLineCode);
  });

  it("handles invalid JSON from model gracefully", async () => {
    mockGenerateTextResult = { text: "```typescript\nconst x = 1;\n```" };

    const req = jsonRequest({
      selectedCode: "const x = 1;",
      fullCode: "const x = 1;",
      instruction: "do something",
    });

    const res = await quickEditMod.POST(req);
    expect(res.status).toBe(500);

    const data = await responseJson(res);
    expect(data.error).toBe("Failed to generate edit");
  });

  it("handles JSON missing required 'editedCode' field", async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({ code: "const x = 1;" }),
    };

    const req = jsonRequest({
      selectedCode: "const x = 1;",
      fullCode: "const x = 1;",
      instruction: "do something",
    });

    const res = await quickEditMod.POST(req);
    expect(res.status).toBe(500);
  });

  it("schema rejects non-string editedCode", () => {
    expect(() =>
      quickEditSchema.parse({ editedCode: ["line1", "line2"] }),
    ).toThrow();
  });
});

describe("Suggestion Error Handling", () => {
  it("returns 403 when unauthenticated", async () => {
    mockUserId = null;

    const req = jsonRequest({
      fileName: "test.ts",
      code: "// test",
      currentLine: "",
      previousLines: "",
      textBeforeCursor: "",
      textAfterCursor: "",
      nextLines: "",
      lineNumber: 1,
    });

    const res = await suggestionMod.POST(req);
    expect(res.status).toBe(403);

    const data = await responseJson(res);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when code is missing", async () => {
    const req = jsonRequest({
      fileName: "test.ts",
      currentLine: "",
      previousLines: "",
      textBeforeCursor: "",
      textAfterCursor: "",
      nextLines: "",
      lineNumber: 1,
    });

    const res = await suggestionMod.POST(req);
    expect(res.status).toBe(400);

    const data = await responseJson(res);
    expect(data.error).toBe("Code is required");
  });
});

describe("Quick Edit Error Handling", () => {
  it("returns 400 when unauthenticated", async () => {
    mockUserId = null;

    const req = jsonRequest({
      selectedCode: "const x = 1;",
      fullCode: "const x = 1;",
      instruction: "rename",
    });

    const res = await quickEditMod.POST(req);
    expect(res.status).toBe(400);

    const data = await responseJson(res);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when selectedCode is missing", async () => {
    const req = jsonRequest({
      fullCode: "const x = 1;",
      instruction: "rename",
    });

    const res = await quickEditMod.POST(req);
    expect(res.status).toBe(400);

    const data = await responseJson(res);
    expect(data.error).toBe("Selected code is required");
  });

  it("returns 400 when instruction is missing", async () => {
    const req = jsonRequest({
      selectedCode: "const x = 1;",
      fullCode: "const x = 1;",
    });

    const res = await quickEditMod.POST(req);
    expect(res.status).toBe(400);

    const data = await responseJson(res);
    expect(data.error).toBe("Instruction is required");
  });
});

describe("Prompt Construction", () => {
  it("suggestion prompt includes all context fields", async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({ suggestion: "" }),
    };

    const req = jsonRequest({
      fileName: "app.tsx",
      code: "const total = items.reduce((a, b) => a + b, 0);",
      currentLine: "const total = items.reduce(",
      previousLines: "const items = [1, 2, 3];",
      textBeforeCursor: "const total = items.reduce(",
      textAfterCursor: ")",
      nextLines: "console.log(total);",
      lineNumber: 5,
    });

    await suggestionMod.POST(req);

    const prompt = capturedCalls[0].prompt;
    expect(prompt).toContain("app.tsx");
    expect(prompt).toContain("const items = [1, 2, 3];");
    expect(prompt).toContain("const total = items.reduce(");
    expect(prompt).toContain("console.log(total);");
    expect(prompt).toContain('number="5"');
  });

  it("quick-edit prompt includes selected code and instruction", async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({ editedCode: "const y = 2;" }),
    };

    const req = jsonRequest({
      selectedCode: "const x = 1;",
      fullCode: "const x = 1;\nconsole.log(x);",
      instruction: "rename x to y",
    });

    await quickEditMod.POST(req);

    const prompt = capturedCalls[0].prompt;
    expect(prompt).toContain("const x = 1;");
    expect(prompt).toContain("rename x to y");
    expect(prompt).toContain("console.log(x);");
  });

  it("quick-edit prompt handles empty fullCode gracefully", async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({ editedCode: "const y = 2;" }),
    };

    const req = jsonRequest({
      selectedCode: "const x = 1;",
      instruction: "rename x to y",
    });

    await quickEditMod.POST(req);

    const prompt = capturedCalls[0].prompt;
    expect(prompt).toContain("const x = 1;");
    expect(prompt).toContain("rename x to y");
  });
});

describe("Zod Schema Validation", () => {
  it("suggestion schema accepts valid input", () => {
    const result = suggestionSchema.parse({ suggestion: "test code" });
    expect(result.suggestion).toBe("test code");
  });

  it("suggestion schema accepts empty string", () => {
    const result = suggestionSchema.parse({ suggestion: "" });
    expect(result.suggestion).toBe("");
  });

  it("suggestion schema rejects missing suggestion", () => {
    expect(() => suggestionSchema.parse({})).toThrow();
  });

  it("suggestion schema rejects null suggestion", () => {
    expect(() =>
      suggestionSchema.parse({ suggestion: null }),
    ).toThrow();
  });

  it("quick-edit schema accepts valid input", () => {
    const result = quickEditSchema.parse({ editedCode: "const x = 1;" });
    expect(result.editedCode).toBe("const x = 1;");
  });

  it("quick-edit schema rejects missing editedCode", () => {
    expect(() => quickEditSchema.parse({})).toThrow();
  });

  it("quick-edit schema strips extra fields", () => {
    const result = quickEditSchema.parse({
      editedCode: "code",
      extra: "field",
    });
    expect(result).toEqual({ editedCode: "code" });
  });
});
