import { generateText } from "ai";

import { createVercelAIModel } from "@/lib/ai-models";
import { extractJSONFromMarkdown } from "@/lib/utils";

import {
  SKILL_ROUTER_PROMPT,
  guessTasteSkillFromMessage,
  isUIGenerationRequest,
  isTasteSkillName,
  type TasteSkillName,
} from "../constants";

export interface SkillRouterInput {
  userMessage: string;
  enhancedMessage: string;
  hasImages: boolean;
  recentHistory: { role: string; content: string }[];
}

export interface SkillRouterDecision {
  skill: TasteSkillName | null;
  reason: string;
  source: "ai" | "fallback-guess" | "none";
}

interface RouterResponse {
  skill: string;
  reason?: string;
}

const MAX_HISTORY_CHARS = 1200;

function formatHistory(history: SkillRouterInput["recentHistory"]): string {
  if (history.length === 0) return "No prior conversation.";
  return history
    .slice(-4)
    .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 300)}`)
    .join("\n")
    .slice(0, MAX_HISTORY_CHARS);
}

/**
 * Picks the best taste skill (or none) for the current request.
 *
 * Uses an LLM-based router so the choice is semantic, not a regex match.
 * Falls back to a syntactic guess if the LLM returns garbage, and to "none"
 * if both fail. Always returns — never throws — so the main pipeline keeps
 * running even when OpenRouter is flaky.
 */
export async function runSkillRouter(
  input: SkillRouterInput
): Promise<SkillRouterDecision> {
  const guess = guessTasteSkillFromMessage(input.userMessage);

  const userBlock = [
    `User message: "${input.userMessage}"`,
    input.enhancedMessage && input.enhancedMessage !== input.userMessage
      ? `Enhanced version: "${input.enhancedMessage.slice(0, 600)}"`
      : null,
    `Has reference images: ${input.hasImages ? "yes" : "no"}`,
    `Syntactic guess (may be wrong): ${guess ?? "none"}`,
    `Recent conversation:\n${formatHistory(input.recentHistory)}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n\n");

  try {
    const result = await generateText({
      model: createVercelAIModel("skill-router"),
      prompt: `${SKILL_ROUTER_PROMPT}\n\n${userBlock}`,
      temperature: 0.1,
    });

    const cleaned = extractJSONFromMarkdown(result.text);
    const parsed = JSON.parse(cleaned) as RouterResponse;
    const reason = parsed.reason?.trim() || "Selected by skill router.";

    if (!parsed.skill || parsed.skill === "none") {
      return { skill: null, reason, source: "ai" };
    }
    if (isTasteSkillName(parsed.skill)) {
      return { skill: parsed.skill, reason, source: "ai" };
    }
    console.warn(
      `[SkillRouter] AI returned unknown skill "${parsed.skill}", falling back`
    );
  } catch (error) {
    console.warn(
      `[SkillRouter] AI router failed, falling back to syntactic guess`,
      error
    );
  }

  if (guess) {
    return {
      skill: guess,
      reason: "AI router unavailable; using syntactic guess.",
      source: "fallback-guess",
    };
  }

  if (input.hasImages) {
    return {
      skill: "image-to-code",
      reason: "AI router unavailable; reference images should use image-to-code.",
      source: "fallback-guess",
    };
  }

  if (
    isUIGenerationRequest(input.userMessage) ||
    isUIGenerationRequest(input.enhancedMessage)
  ) {
    return {
      skill: "design-taste-frontend",
      reason: "AI router unavailable; defaulting UI generation to the frontend taste skill.",
      source: "fallback-guess",
    };
  }

  return {
    skill: null,
    reason: "AI router unavailable and no syntactic match.",
    source: "none",
  };
}
