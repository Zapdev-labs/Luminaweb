import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { safeParseAIJSON } from "@/lib/utils";

const openrouter = createOpenAICompatible({
  name: 'openrouter',
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const requestSchema = z.object({
  fileName: z.string().max(500).optional().default(""),
  code: z.string().max(500_000),
  currentLine: z.string().max(10_000).optional().default(""),
  previousLines: z.string().max(50_000).optional().default(""),
  textBeforeCursor: z.string().max(10_000).optional().default(""),
  textAfterCursor: z.string().max(10_000).optional().default(""),
  nextLines: z.string().max(50_000).optional().default(""),
  lineNumber: z.number().int().min(0).max(1_000_000).optional().default(0),
});

const suggestionSchema = z.object({
  suggestion: z
    .string()
    .describe(
      "The code to insert at cursor, or empty string if no completion needed"
    ),
});

const SUGGESTION_PROMPT = `You are a code suggestion assistant.

<context>
<file_name>{fileName}</file_name>
<previous_lines>
{previousLines}
</previous_lines>
<current_line number="{lineNumber}">{currentLine}</current_line>
<before_cursor>{textBeforeCursor}</before_cursor>
<after_cursor>{textAfterCursor}</after_cursor>
<next_lines>
{nextLines}
</next_lines>
<full_code>
{code}
</full_code>
</context>

<instructions>
Follow these steps IN ORDER:

1. First, look at next_lines. If next_lines contains ANY code, check if it continues from where the cursor is. If it does, return empty string immediately - the code is already written.

2. Check if before_cursor ends with a complete statement (;, }, )). If yes, return empty string.

3. Only if steps 1 and 2 don't apply: suggest what should be typed at the cursor position, using context from full_code.

Your suggestion is inserted immediately after the cursor, so never suggest code that's already in the file.
</instructions>`;

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    const {
      fileName,
      code,
      currentLine,
      previousLines,
      textBeforeCursor,
      textAfterCursor,
      nextLines,
      lineNumber,
    } = parsed.data;

    const prompt = SUGGESTION_PROMPT
      .replace("{fileName}", fileName)
      .replace("{code}", code)
      .replace("{currentLine}", currentLine)
      .replace("{previousLines}", previousLines || "")
      .replace("{textBeforeCursor}", textBeforeCursor)
      .replace("{textAfterCursor}", textAfterCursor)
      .replace("{nextLines}", nextLines || "")
      .replace("{lineNumber}", lineNumber.toString());

    const { text: rawResult } = await generateText({
      model: openrouter("x-ai/grok-4.1-fast"),
      prompt,
    });

    if (!rawResult || rawResult.trim().length === 0) {
      return NextResponse.json(
        { error: "Empty response from AI model" },
        { status: 502 }
      );
    }

    let parsedData;
    try {
      parsedData = safeParseAIJSON<unknown>(rawResult);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return NextResponse.json(
        { error: "Invalid response format from AI model" },
        { status: 502 }
      );
    }

    const validationResult = suggestionSchema.safeParse(parsedData);
    if (!validationResult.success) {
      console.error("Schema validation error:", validationResult.error);
      return NextResponse.json(
        { error: "AI response did not match expected format" },
        { status: 502 }
      );
    }

    return NextResponse.json({ suggestion: validationResult.data.suggestion });
  } catch (error) {
    console.error("Suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}
