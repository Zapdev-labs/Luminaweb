import type { Metadata } from "next";
import { ProjectsView } from "@/features/projects/components/projects-view";

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

export const metadata: Metadata = {
  title: "LuminaWeb – Cloud IDE with AI | Code in Your Browser",
  description:
    "LuminaWeb is a browser-based cloud IDE for writing, running, and deploying code. AI suggestions, Cmd+K quick edit, GitHub integration, and WebContainer execution — no installation required.",
  openGraph: {
    title: "LuminaWeb – Cloud IDE with AI | Code in Your Browser",
    description:
      "Browser-based cloud IDE with AI code suggestions, Cmd+K quick edit, GitHub import/export, and in-browser execution. Start coding in seconds — no install needed.",
    url: baseUrl,
    type: "website",
  },
  alternates: baseUrl ? { canonical: baseUrl } : undefined,
};

const Home = () => {
  return <ProjectsView />;
};

export default Home;
