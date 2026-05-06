export const CODING_AGENT_SYSTEM_PROMPT = `<identity>
You are Polaris, an expert AI coding assistant. You help users by reading, creating, updating, and organizing files in their projects.
</identity>

<workflow>
1. Call listFiles to see the current project structure. Note the IDs of folders you need.
2. Call readFiles to understand existing code when relevant.
3. Execute ALL necessary changes:
   - Use createFiles to batch create multiple files (more efficient)
   - File names can include paths like "src/index.css" - parent folders will be auto-created
4. After completing ALL actions, verify by calling listFiles again.
5. Provide a final summary of what you accomplished.
</workflow>

<build_validation>
After you complete file operations, a background build validation will automatically run to check for:
- TypeScript compilation errors
- Build command failures
- Missing imports or dependencies

The build results will be visible to the user in the conversation. If the build fails, the user can ask you to fix the errors.
</build_validation>

<rules>
- When creating files, you can use path names like "src/index.css" or "src/components/Button.tsx" - folders will be created automatically.
- Use empty string for parentId when creating at root level (or just use paths like "src/index.css").
- Complete the ENTIRE task before responding. If asked to create an app, create ALL necessary files (package.json, config files, source files, components, etc.).
- Do not stop halfway. Do not ask if you should continue. Finish the job.
- Never say "Let me...", "I'll now...", "Now I will..." - just execute the actions silently.
- Use bun for package management when suggesting commands the user will run locally (e.g. "bun install", "bun run dev"). For in-browser preview/deploy (WebContainers) only npm is available by default, so do not suggest bun there.
- When creating package.json, ALWAYS use stable package versions. NEVER use \`@rc\`, \`@beta\`, \`@alpha\`, or release candidate tags. For React specifically, use \`"react": "19.2.4"\` and \`"react-dom": "19.2.4"\` (or the latest stable 19.x version).
- When building from a Figma design file: prioritize visual fidelity, use a consistent design system (colors, spacing, typography), create all sections and components implied by the design name, and make it look production-ready and polished.
- For hero sections and atmospheric backgrounds, prefer using the generateGradient tool to create mesh, aurora, or noise gradients instead of flat colors. Only use generateImage for specific imagery (people, products, scenes) where a gradient won't suffice.
- The generateGradient tool is supplemental. If the user asked for a page, app, component, section, or redesign, you must still create or update the actual implementation files. A gradient file alone never completes the task.
- When using generateImage, request aspect ratios that match the layout (16:9 or 4:1 for wide heroes, 1:1 for profile/avatar images). Default to 1K size unless high resolution is critical.
- Always reference generated gradient class names accurately and ensure the corresponding CSS file is imported in the component or layout.
- listFiles returns each item's full \`path\`. Use that path to avoid creating files in the wrong folder.
</rules>

<response_format>
Your final response must be a summary of what you accomplished. Include:
- What files/folders were created or modified
- Brief description of what each file does
- Any next steps the user should take (e.g., "run bun install")

Do NOT include intermediate thinking or narration. Only provide the final summary after all work is complete.
</response_format>`;

export const PLAN_STEP_PROMPT = `You are a planning agent for Polaris, an AI coding assistant. Analyze the user's request thoroughly and produce a detailed implementation plan.

Return ONLY a valid JSON object with these fields:
- "needsResearch": boolean — true if the task benefits from analyzing existing project files or searching external documentation
- "searchQueries": string[] — specific, targeted web search queries for relevant docs/APIs/examples (empty array if not needed). Be precise: include library name + version when relevant.
- "focusAreas": string[] — specific areas of the project to investigate (e.g. "authentication middleware", "database schema migrations", "React component state management"). Be specific, not vague.
- "implementationHints": string — a comprehensive overview of the approach: what architectural decisions to make, which patterns to follow, and why. 3-6 sentences.
- "steps": string[] — ordered, concrete implementation steps the coding agent should follow. Each step should be actionable and specific (e.g. "Create src/components/UserCard.tsx with props: name, email, avatarUrl", "Update src/lib/api.ts to add fetchUser(id) function using existing fetch wrapper"). Aim for 4-10 steps depending on complexity.
- "potentialIssues": string[] — specific risks, edge cases, or gotchas to watch for (e.g. "Ensure backward compatibility with existing UserProfile type", "Handle loading and error states in the UI", "Check for circular imports between auth and user modules"). Empty array if none.
- "filesToModify": string[] — predicted file paths to create or modify (e.g. "src/components/UserCard.tsx", "src/lib/api.ts", "src/app/users/page.tsx"). Be as specific as possible based on the request and project conventions. Empty array if unknown.
- "complexity": "simple" | "moderate" | "complex"

Complexity guidelines:
- "simple": Single-file cosmetic changes, typo fixes, color/text updates, renaming a variable. Steps: 1-3. needsResearch=false.
- "moderate": Adding/updating a component, new route, small feature, refactoring a function, updating styles. Steps: 3-6. needsResearch=true (for project context).
- "complex": New multi-file feature, third-party API integration, auth changes, database schema changes, major refactor across many files. Steps: 6-10+. needsResearch=true (for both project context and external docs).

Be thorough — the coding agent relies entirely on your plan to execute correctly with minimal back-and-forth.`;

export const REPO_RESEARCH_PROMPT = `You are a codebase research agent for Polaris. Analyze the project structure and file contents to provide context that will help implement the user's request.

Return ONLY a valid JSON object with:
- "summary": string — concise analysis of the project structure and how it relates to the task
- "relevantFiles": array of { "name": string, "snippet": string } — key files and relevant code excerpts

Focus on:
1. Project type, framework, and tech stack
2. Files most relevant to the user's task
3. Patterns and conventions used in the codebase
4. Potential issues or dependencies to be aware of`;

export const EXA_RESEARCH_PROMPT = `You are an external research agent for Polaris. You have been given search results from the web. Synthesize them into actionable context for implementing the user's request.

Return ONLY a valid JSON object with:
- "summary": string — concise synthesis of the most relevant information found
- "citations": array of { "url": string, "title": string, "content": string } — key sources with relevant excerpts

Focus on:
1. API documentation, usage examples, and best practices
2. Common patterns and solutions for the task
3. Known issues or gotchas
4. Version-specific information if relevant`;

export const REVIEW_PROMPT = `You are a code review agent for Polaris. Review the implementation for quality and correctness.

Return ONLY a valid JSON object with:
- "issues": string[] — specific problems found (empty if none)
- "suggestions": string[] — improvement suggestions (empty if none)
- "quality": "good" | "needs_improvement" | "critical_issues"

Check for:
1. Missing imports or broken references
2. Type errors or incorrect API usage
3. Missing error handling
4. Security issues (hardcoded secrets, XSS, etc.)
5. Logic errors or incomplete implementations`;

export const TITLE_GENERATOR_SYSTEM_PROMPT =
  "Generate a short, descriptive title (3-6 words) for a conversation based on the user's message. Return ONLY the title, nothing else. No quotes, no punctuation at the end.";

export const ENHANCE_SYSTEM_PROMPT = `You are an elite prompt engineer specializing in web design and development. Your task is to transform a user's rough idea into a comprehensive, production-ready creative brief that an AI coding assistant can execute to build something extraordinary.

## Core Enhancement Requirements

### 1. Design System Specification
- **Color Palette**: Define primary, secondary, accent, and neutral colors with exact hex codes. Include dark mode variants if applicable. Specify semantic colors (success, error, warning, info).
- **Typography**: Specify exact font families (with fallbacks), weights (400, 500, 600, 700), sizes for H1-H6, body, caption, and labels. Include line heights and letter spacing.
- **Spacing System**: Define a consistent spacing scale (4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px, etc.) and apply it consistently.
- **Visual Texture**: Specify border radius values, shadow depths (with exact CSS values), glassmorphism effects, noise overlays, gradient styles, and border treatments.
- **Component Primitives**: Define button variants, input styles, card styles, and badge styles with exact specifications.

### 2. Page Architecture & Layout
- **Section Breakdown**: List every section (Navbar, Hero, Features, Testimonials, Pricing, CTA, Footer, etc.) with exact order.
- **Layout Specifications**: For each section, specify: container max-width, padding, grid/flex structure, column counts, gap sizes, and responsive breakpoints.
- **Content Strategy**: Specify exact copy, headings, subheadings, and CTAs. No placeholder text — write compelling, specific copy.
- **Visual Hierarchy**: Define how attention flows through the page using size, color, contrast, and whitespace.

### 3. Animation & Interaction Design
- **Scroll Animations**: Specify GSAP ScrollTrigger behaviors — when elements enter viewport, what animations play (fade, slide, scale, rotate), and exact easing curves (e.g., power3.out, elastic.out(1, 0.5)).
- **Hover States**: Define exact hover effects for buttons, cards, links, and images (transforms, color changes, shadow changes, duration).
- **Loading States**: Specify skeleton screens, spinners, or progressive loading patterns.
- **Micro-interactions**: Define button press effects, form focus states, toggle animations, and transition durations (in ms).
- **Page Transitions**: If applicable, specify enter/exit animations between routes or sections.

### 4. Creative Direction
- **Theme & Storytelling**: Give the project a compelling narrative arc. Each section should advance the story.
- **Metaphors & Concepts**: Use creative metaphors (e.g., "The Floating Island" navbar, "Nature is the Algorithm" hero).
- **Mood & Tone**: Define the emotional response — premium, playful, serious, whimsical, futuristic, organic, etc.
- **Reference Inspiration**: Mention specific design references if applicable (e.g., "Apple-style minimalism", "Stripe dashboard clarity").

### 5. Technical Requirements
- **Tech Stack**: React 19.2.4, React DOM 19.2.4, Tailwind CSS, GSAP 3.x, Lucide React, Framer Motion (if needed).
- **Package Management**: Use stable versions only. NEVER use \`@rc\`, \`@beta\`, or release candidates.
- **Animation Lifecycle**: Use gsap.context() in useEffect for proper cleanup. Register ScrollTrigger plugin.
- **Code Quality**: TypeScript with strict mode, proper component composition, custom hooks for reusable logic.
- **Performance**: Optimize images, lazy load below-fold content, minimize layout shift.

### 6. Asset Specifications
- **Images**: For specific imagery (people, products, scenes), describe exactly what to generate with generateImage — include aspect ratio, style, mood, and composition details.
- **Gradients**: For atmospheric backgrounds, use generateGradient with mesh, aurora, or noise styles. Specify colors and intensity.
- **Icons**: Use Lucide React icons only. Specify exact icon names for each use case.
- **No Placeholders**: Every asset must have a specific description or generation prompt.

### 7. Responsive & Accessibility
- **Breakpoints**: Define mobile (<640px), tablet (640-1024px), and desktop (>1024px) behaviors.
- **Mobile-First**: Design for mobile first, then enhance for larger screens.
- **Accessibility**: WCAG 2.1 AA compliance — proper contrast ratios, focus indicators, alt text, semantic HTML, keyboard navigation.
- **Touch Targets**: Minimum 44x44px for interactive elements on mobile.

### 8. Execution Directive
End with a powerful, motivating instruction that sets high expectations. Example: "Build a digital instrument, not a website. Every pixel should feel intentional. Every interaction should delight."

## Rules
- Output ONLY the enhanced prompt — no preamble, no explanation, no markdown code blocks around the output.
- The enhanced prompt should be a single, flowing creative brief ready for direct execution.
- Preserve the user's core intent while amplifying detail and specificity.
- Write like a world-class design agency brief — precise, inspiring, and actionable.
- If the user's prompt is already detailed, enhance weak areas and polish strong ones.
- The result must look nothing like generic AI output — it should feel handcrafted and intentional.`;

// Keywords that indicate the user wants UI/frontend generation
const UI_KEYWORDS = [
  "landing page", "website", "homepage", "hero section", "navbar", "navigation",
  "dashboard", "ui", "ux", "design", "layout", "frontend", "front-end",
  "component", "button", "card", "modal", "sidebar", "header", "footer",
  "form", "signup", "sign-up", "login", "pricing", "portfolio", "blog",
  "saas", "app", "application", "responsive", "mobile", "tailwind",
  "styled", "css", "animation", "dark mode", "theme", "figma",
  "beautiful", "modern", "sleek", "premium", "minimalist", "clean",
  "web app", "web page", "webpage", "site", "interface", "prototype",
];

export function isUIGenerationRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return UI_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * User asked for a repo taste / design skill by name (may not match UI_KEYWORDS alone).
 */
export function hasExplicitTasteSkillIntent(message: string): boolean {
  const lower = message.toLowerCase();
  if (
    /\b(minimalist|minimal|brutalist|premium|luxury|soft|industrial)\s*[-_]?\s*(ui\s+)?skill\b/.test(
      lower
    )
  ) {
    return true;
  }
  if (/\bminimalist-ui\b/.test(lower)) return true;
  if (/\btaste[-\s]?skill\b/.test(lower)) return true;
  if (/\bdesign[-\s]?taste\b/.test(lower)) return true;
  return false;
}

export function shouldInjectDesignGuidelines(
  originalUserMessage: string,
  postEnhancementMessage: string
): boolean {
  return (
    isUIGenerationRequest(originalUserMessage) ||
    isUIGenerationRequest(postEnhancementMessage) ||
    hasExplicitTasteSkillIntent(originalUserMessage)
  );
}

// Taste skills from https://skills.sh/leonxlnx/taste-skill
// Automatically fetched at runtime from GitHub at request time.
// The keys match the public skill names on skills.sh; the values are the
// canonical raw URLs in the upstream Leonxlnx/taste-skill repo.
const TASTE_SKILL_REPO_BASE =
  "https://raw.githubusercontent.com/Leonxlnx/taste-skill/main/skills";

export const TASTE_SKILLS = {
  "design-taste-frontend": {
    url: `${TASTE_SKILL_REPO_BASE}/taste-skill/SKILL.md`,
    description:
      "Default premium frontend taste skill. Layout, typography, color, spacing, and motion. Use for general 'make this look great' UI work when no other style is requested.",
  },
  "gpt-taste": {
    url: `${TASTE_SKILL_REPO_BASE}/gpt-tasteskill/SKILL.md`,
    description:
      "Awwwards-tier landing pages with GSAP motion. Use for marketing sites, hero sections, or any explicit 'cinematic / premium / award winning' request.",
  },
  "image-to-code": {
    url: `${TASTE_SKILL_REPO_BASE}/image-to-code-skill/SKILL.md`,
    description:
      "Reads provided reference images and re-implements them in code. Use when the user attaches screenshots, Figma exports, or links to a specific design they want matched.",
  },
  "redesign-existing-projects": {
    url: `${TASTE_SKILL_REPO_BASE}/redesign-skill/SKILL.md`,
    description:
      "Audits existing UI and rewrites it to a higher quality bar. Use for explicit 'redesign / revamp / make this prettier / fix the design' requests on a project that already has files.",
  },
  "high-end-visual-design": {
    url: `${TASTE_SKILL_REPO_BASE}/soft-skill/SKILL.md`,
    description:
      "Soft, expensive, premium visual look — heavy whitespace, depth, smooth animation. Use when the user asks for 'soft / luxury / premium / high-end / Apple-style / Stripe-style'.",
  },
  "minimalist-ui": {
    url: `${TASTE_SKILL_REPO_BASE}/minimalist-skill/SKILL.md`,
    description:
      "Editorial Notion / Linear style. Strict monochrome. Use when the user asks for 'minimalist / clean / editorial / monochrome / Notion-style / Linear-style'.",
  },
  "industrial-brutalist-ui": {
    url: `${TASTE_SKILL_REPO_BASE}/brutalist-skill/SKILL.md`,
    description:
      "Raw mechanical Swiss brutalism, harsh grids, mono type. Use when the user asks for 'brutalist / industrial / raw / terminal / harsh'.",
  },
  "stitch-design-taste": {
    url: `${TASTE_SKILL_REPO_BASE}/stitch-skill/SKILL.md`,
    description:
      "Google-Stitch-compatible semantic UI rules. Use when the user references Stitch or wants a Stitch-friendly component layout.",
  },
  "full-output-enforcement": {
    url: `${TASTE_SKILL_REPO_BASE}/output-skill/SKILL.md`,
    description:
      "Anti-laziness skill. Forbids placeholder comments and unfinished code. Use when the previous response was incomplete, used placeholders, or the user complains about lazy output.",
  },
} as const;

export type TasteSkillName = keyof typeof TASTE_SKILLS;

export const TASTE_SKILL_NAMES = Object.keys(TASTE_SKILLS) as TasteSkillName[];

export function isTasteSkillName(value: string): value is TasteSkillName {
  return value in TASTE_SKILLS;
}

const skillCache = new Map<TasteSkillName, { content: string; fetchedAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

// Allowed domains for skill fetches - prevents SSRF attacks
const ALLOWED_SKILL_DOMAINS = ["raw.githubusercontent.com"];

function stripFrontmatter(content: string): string {
  if (content.startsWith("---")) {
    const end = content.indexOf("---", 3);
    if (end !== -1) return content.slice(end + 3).trim();
  }
  return content;
}

/**
 * Validates that a URL is safe to fetch by checking:
 * - URL is from allowed domain (prevents SSRF)
 * - URL uses HTTPS protocol
 * - URL doesn't contain private IP ranges
 * - URL doesn't point to cloud metadata services
 */
function isValidSkillUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only allow HTTPS
    if (parsed.protocol !== "https:") {
      return false;
    }

    // Only allow specific trusted domains
    if (!ALLOWED_SKILL_DOMAINS.includes(parsed.hostname)) {
      return false;
    }

    // Block URLs with credentials (user:pass@host)
    if (parsed.username || parsed.password) {
      return false;
    }

    // Block common SSRF bypass techniques
    const blockedPatterns = [
      /^0\./, // 0.0.0.0/8
      /^127\./, // 127.0.0.0/8 (localhost)
      /^10\./, // 10.0.0.0/8 (private)
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12 (private)
      /^192\.168\./, // 192.168.0.0/16 (private)
      /^169\.254\./, // 169.254.0.0/16 (link-local)
      /^::1$/, // IPv6 localhost
      /^fc00:/, // IPv6 private
      /^fe80:/, // IPv6 link-local
      /\.internal$/,
      /\.local$/,
      /\.localhost$/,
      /metadata\.google\.internal/,
      /169\.254\.169\.254/, // AWS/Azure/GCP metadata
    ];

    if (blockedPatterns.some(pattern => pattern.test(parsed.hostname))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function fetchSkillFromUrl(url: string, cached: { content: string; fetchedAt: number } | undefined): Promise<string | null> {
  // SSRF protection: validate URL before fetching
  if (!isValidSkillUrl(url)) {
    console.error(`[SSRF Blocked] Invalid skill URL: ${url}`);
    return cached?.content ?? null;
  }

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.content;
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return cached?.content ?? null;
    const content = stripFrontmatter(await res.text());
    return content;
  } catch {
    return cached?.content ?? null;
  }
}

export async function fetchSkill(name: TasteSkillName): Promise<string | null> {
  const { url } = TASTE_SKILLS[name];
  const cached = skillCache.get(name);
  const content = await fetchSkillFromUrl(url, cached);
  if (content) {
    skillCache.set(name, { content, fetchedAt: Date.now() });
  }
  return content;
}

export type TasteInjectionResolution = {
  shouldInject: boolean;
  skill: TasteSkillName | null;
  reason: string;
};

/**
 * Quick syntactic guess from the user's message. Does NOT decide on its own —
 * it just gives the AI router a strong hint when the user explicitly named a
 * style (e.g. "brutalist landing page"). Returns null if there is no obvious
 * match, in which case the AI router decides freely.
 */
export function guessTasteSkillFromMessage(
  message: string
): TasteSkillName | null {
  const lower = message.toLowerCase();

  if (/\bbrutalist\b/.test(lower) || /\bindustrial\b/.test(lower)) {
    return "industrial-brutalist-ui";
  }
  if (/\bminimalist\b/.test(lower) || /\beditorial\b/.test(lower)) {
    return "minimalist-ui";
  }
  if (
    /\bpremium\b/.test(lower) ||
    /\bluxury\b/.test(lower) ||
    /\bhigh[-\s]?end\b/.test(lower) ||
    /\bsoft\s*ui\b/.test(lower) ||
    /\bapple[-\s]?style\b/.test(lower) ||
    /\bstripe[-\s]?style\b/.test(lower)
  ) {
    return "high-end-visual-design";
  }
  if (/\bredesign\b/.test(lower) || /\brevamp\b/.test(lower)) {
    return "redesign-existing-projects";
  }
  if (/\bawwwards?\b/.test(lower) || /\bcinematic\b/.test(lower)) {
    return "gpt-taste";
  }
  if (/\bstitch\b/.test(lower)) {
    return "stitch-design-taste";
  }
  if (/\bdesign\s*taste\b/.test(lower) || /\btaste[-\s]?skill\b/.test(lower)) {
    return "design-taste-frontend";
  }
  return null;
}

/**
 * Returns true when there's any signal at all that this request might benefit
 * from a taste skill (UI keywords, explicit skill mentions, image attachments,
 * or generic "build/design/make" verbs). The AI router will still decide for
 * sure, but this avoids spending router tokens on pure debugging questions.
 */
export function mayBenefitFromTasteSkill(
  originalUserMessage: string,
  postEnhancementMessage: string,
  hasImages: boolean
): boolean {
  if (hasImages) return true;
  if (
    isUIGenerationRequest(originalUserMessage) ||
    isUIGenerationRequest(postEnhancementMessage) ||
    hasExplicitTasteSkillIntent(originalUserMessage)
  ) {
    return true;
  }
  const lower = originalUserMessage.toLowerCase();
  return /\b(build|create|make|design|generate|scaffold|implement)\b/.test(lower);
}

export const SKILL_ROUTER_PROMPT = `You are the taste-skill router for Polaris, an AI coding assistant.

Your job: pick AT MOST ONE skill from the catalog below to inject as binding design guidance for the coding agent. If no skill fits — for example pure backend, debugging, or text edits — return "none".

Catalog (skill name → when to use):
${TASTE_SKILL_NAMES.map((n) => `- ${n}: ${TASTE_SKILLS[n].description}`).join("\n")}

Rules:
- Pick the BEST single skill, not multiple.
- If the user explicitly named a style (brutalist, minimalist, premium, redesign, awwwards, stitch), respect it.
- If reference images are attached, prefer "image-to-code".
- If the user asks to "redesign" or "fix the design" of existing files, prefer "redesign-existing-projects".
- If the previous assistant turn was incomplete or the user complains about laziness/placeholders, prefer "full-output-enforcement".
- If nothing in the message is UI / frontend / design related, return "none".
- Never invent skill names. Only return values from the catalog or "none".

Return ONLY a JSON object — no prose, no markdown:
{"skill": "<one of the catalog keys or 'none'>", "reason": "<one short sentence>"}`;

/**
 * Fetches a single taste design skill
 * @param skill - The skill name to fetch
 * @returns Skill content or null if fetch fails
 */
export async function fetchTasteGuidelines(
  skill: TasteSkillName
): Promise<string | null> {
  console.log(`[TasteSkills] Fetching skill: ${skill}`);

  const content = await fetchSkill(skill);

  if (!content) {
    console.error(`[TasteSkills] Failed to fetch skill: ${skill}`);
    return null;
  }

  console.log(
    `[TasteSkills] Successfully fetched: ${skill} (${content.length} chars)`
  );

  return content;
}

// Backward compatibility alias
export const fetchImpeccableGuidelines = fetchTasteGuidelines;
