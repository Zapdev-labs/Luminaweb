import { z } from "zod";
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { firecrawl } from "@/lib/firecrawl";
import { safeParseAIJSON } from "@/lib/utils";
import { filterSafeExternalUrls } from "@/lib/url-safety";

const openrouter = createOpenAICompatible({
  name: 'openrouter',
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const quickEditSchema = z.object({
  editedCode: z
    .string()
    .describe(
      "The edited version of the selected code based on the instruction"
    ),
});

const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;

const QUICK_EDIT_PROMPT = `You are a code editing assistant. Edit the selected code based on the user's instruction.

<context>
<selected_code>
{selectedCode}
</selected_code>
<full_code_context>
{fullCode}
</full_code_context>
</context>

{documentation}

<instruction>
{instruction}
</instruction>

<instructions>
Return ONLY the edited version of the selected code.
Maintain the same indentation level as the original.
Do not include any explanations or comments unless requested.
If the instruction is unclear or cannot be applied, return the original code unchanged.
</instructions>`;

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    const { selectedCode, fullCode, instruction } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!selectedCode) {
      return NextResponse.json(
        { error: "Selected code is required" },
        { status: 400 }
      );
    }

    if (!instruction) {
      return NextResponse.json(
        { error: "Instruction is required" },
        { status: 400 }
      );
    }

    const urls: string[] = instruction.match(URL_REGEX) || [];
    const safeUrls = filterSafeExternalUrls(urls);
    let documentationContext = "";

    if (urls.length > 0 && safeUrls.length !== urls.length) {
      return NextResponse.json(
        { error: "One or more URLs in the instruction are not allowed" },
        { status: 400 }
      );
    }

    if (safeUrls.length > 0) {
      const scrapedResults = await Promise.all(
        safeUrls.map(async (url) => {
          try {
            const result = await firecrawl.scrape(url, {
              formats: ["markdown"],
            });

            if (result.markdown) {
              return `<doc url="${url}">\n${result.markdown}\n</doc>`;
            }

            return null;
          } catch {
            return null;
          }
        })
      );

      const validResults = scrapedResults.filter(Boolean);

      if (validResults.length > 0) {
        documentationContext = `<documentation>\n${validResults.join("\n\n")}\n</documentation>`;
      }
    }

    const prompt = QUICK_EDIT_PROMPT
      .replace("{selectedCode}", selectedCode)
      .replace("{fullCode}", fullCode || "")
      .replace("{instruction}", instruction)
      .replace("{documentation}", documentationContext);

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

    const validationResult = quickEditSchema.safeParse(parsedData);
    if (!validationResult.success) {
      console.error("Schema validation error:", validationResult.error);
      return NextResponse.json(
        { error: "AI response did not match expected format" },
        { status: 502 }
      );
    }

    return NextResponse.json({ editedCode: validationResult.data.editedCode });
  } catch (error) {
    console.error("Edit error:", error);
    return NextResponse.json(
      { error: "Failed to generate edit" },
      { status: 500 }
    );
  }
};
