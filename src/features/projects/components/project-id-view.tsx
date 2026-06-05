"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Allotment } from "allotment";
import {
  BotIcon,
  BoxesIcon,
  BugIcon,
  CheckCircle2Icon,
  Code2Icon,
  EyeIcon,
  FilesIcon,
  GitBranchIcon,
  MaximizeIcon,
  MinimizeIcon,
  PanelBottomIcon,
  PlayIcon,
  SearchIcon,
  SplitSquareHorizontalIcon,
  TerminalSquareIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { EditorView } from "@/features/editor/components/editor-view";
import { useEditor } from "@/features/editor/hooks/use-editor";
import { useFile, useFiles } from "@/features/projects/hooks/use-files";

import { FileExplorer } from "./file-explorer";
import { Id } from "../../../../convex/_generated/dataModel";
import { PreviewView } from "./preview-view";
import { ExportPopover } from "./export-popover";
import { DeployPopover } from "./deploy-popover";
import { useFullscreen } from "./fullscreen-context";
import { useProject } from "../hooks/use-projects";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 800;
const DEFAULT_SIDEBAR_WIDTH = 350;
const DEFAULT_MAIN_SIZE = 1000;

type WorkbenchView = "editor" | "preview" | "split";

const Tab = ({
  label,
  icon: Icon,
  isActive,
  onClick
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  isActive: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-full items-center gap-2 border-r px-3 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
        isActive && "bg-background text-foreground shadow-[inset_0_-1px_0_var(--background)]"
      )}
    >
      <Icon className="size-3.5" />
      <span className="text-sm">{label}</span>
    </button>
  );
};

const ActivityButton = ({
  label,
  icon: Icon,
  isActive,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  isActive?: boolean;
}) => (
  <button
    className={cn(
      "group relative flex size-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground",
      isActive && "bg-accent/60 text-foreground"
    )}
    title={label}
  >
    {isActive && <span className="absolute left-0 h-6 w-0.5 rounded-r bg-ring" />}
    <Icon className="size-5" />
  </button>
);

const CommandCenter = ({ projectName }: { projectName: string }) => (
  <button className="mx-2 hidden h-6 min-w-64 max-w-xl flex-1 items-center justify-between rounded-md border border-border/60 bg-background/70 px-2.5 text-xs text-muted-foreground shadow-inner transition-colors hover:border-ring/60 hover:text-foreground md:flex">
    <span className="flex items-center gap-2 truncate">
      <SearchIcon className="size-3.5" />
      <span className="truncate">Search files, commands, symbols in {projectName}</span>
    </span>
    <span className="ml-3 rounded border border-border/70 px-1.5 py-0.5 font-mono text-[10px]">⌘K</span>
  </button>
);

const BottomPanel = ({
  openTabsCount,
  typeScriptFileCount,
}: {
  openTabsCount: number;
  typeScriptFileCount: number;
}) => (
  <div className="h-full border-t bg-sidebar/95 text-xs">
    <div className="flex h-8 items-center border-b text-muted-foreground">
      <button className="flex h-full items-center gap-2 border-r bg-background px-3 text-foreground">
        <TerminalSquareIcon className="size-3.5" /> Output
      </button>
      <button className="flex h-full items-center gap-2 border-r px-3 hover:bg-accent/40 hover:text-foreground">
        <BugIcon className="size-3.5" /> Problems
        <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-[10px]">0</span>
      </button>
      <button className="flex h-full items-center gap-2 border-r px-3 hover:bg-accent/40 hover:text-foreground">
        <GitBranchIcon className="size-3.5" /> Source Control
      </button>
    </div>
    <div className="grid h-[calc(100%-2rem)] grid-cols-[1fr_18rem] overflow-hidden">
      <div className="space-y-2 overflow-auto p-3 font-mono text-[11px] text-muted-foreground">
        <p><span className="text-ring">lumina</span> workspace ready</p>
        <p>watching {openTabsCount || "no"} open editor {openTabsCount === 1 ? "tab" : "tabs"}</p>
        <p>quick edit, inline AI suggestions, live preview, deploy and export are available from this workbench</p>
        <p>index includes {typeScriptFileCount} TypeScript {typeScriptFileCount === 1 ? "file" : "files"}</p>
      </div>
      <div className="border-l p-3 text-muted-foreground">
        <div className="mb-2 flex items-center gap-2 text-foreground">
          <CheckCircle2Icon className="size-4 text-ring" /> Environment
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between"><span>TypeScript</span><span className="font-mono">active</span></div>
          <div className="flex justify-between"><span>Preview</span><span className="font-mono">webcontainer</span></div>
          <div className="flex justify-between"><span>AI tools</span><span className="font-mono">online</span></div>
        </div>
      </div>
    </div>
  </div>
);

const StatusBar = ({
  activeFileName,
  fileCount,
  lineCount,
  view,
}: {
  activeFileName: string;
  fileCount: number;
  lineCount: number;
  view: WorkbenchView;
}) => (
  <footer className="flex h-6 shrink-0 items-center justify-between border-t bg-ring px-2 font-mono text-[11px] text-primary-foreground">
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-1"><GitBranchIcon className="size-3" /> main</span>
      <span>{fileCount} files</span>
      <span className="hidden sm:inline">{activeFileName}</span>
    </div>
    <div className="flex items-center gap-3">
      <span>{lineCount} lines</span>
      <span>{view}</span>
      <span>Spaces: 2</span>
      <span>UTF-8</span>
    </div>
  </footer>
);

export const ProjectIdView = ({ 
  projectId
}: { 
  projectId: Id<"projects">
}) => {
  const [activeView, setActiveView] = useState<WorkbenchView>("editor");
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(true);
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const project = useProject(projectId);
  const files = useFiles(projectId);
  const { activeTabId, openTabs } = useEditor(projectId);
  const activeFile = useFile(activeTabId);

  const projectName = project?.name ?? "Workspace";
  const textContent = activeFile && !activeFile.storageId ? activeFile.content : "";
  const lineCount = useMemo(() => {
    if (!textContent) return 0;
    return textContent.split("\n").length;
  }, [textContent]);

  const typeScriptFileCount = useMemo(() => {
    return files?.filter((file) => file.type === "file" && file.name.endsWith(".ts")).length ?? 0;
  }, [files]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "j") {
        event.preventDefault();
        setIsBottomPanelOpen((value) => !value);
      }
      if ((event.metaKey || event.ctrlKey) && key === "b") {
        event.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleFullscreen]);

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      <nav className="h-9 flex shrink-0 items-center border-b bg-sidebar">
        <Tab
          label="Code"
          icon={Code2Icon}
          isActive={activeView === "editor"}
          onClick={() => setActiveView("editor")}
        />
        <Tab
          label="Preview"
          icon={EyeIcon}
          isActive={activeView === "preview"}
          onClick={() => setActiveView("preview")}
        />
        <Tab
          label="Split"
          icon={SplitSquareHorizontalIcon}
          isActive={activeView === "split"}
          onClick={() => setActiveView("split")}
        />
        <CommandCenter projectName={projectName} />
        <div className="flex-1 flex justify-end h-full">
          <button
            onClick={() => setIsBottomPanelOpen((value) => !value)}
            className={cn(
              "flex items-center gap-2 border-l px-3 text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground",
              isBottomPanelOpen && "text-foreground"
            )}
            title="Toggle bottom panel (⌘J)"
          >
            <PanelBottomIcon className="size-3.5" />
            <span className="hidden text-sm lg:inline">Panel</span>
          </button>
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-2 px-3 border-l hover:bg-accent/30 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
            title={isFullscreen ? "Exit full screen" : "Full screen code"}
          >
            {isFullscreen ? (
              <MinimizeIcon className="size-3.5" />
            ) : (
              <MaximizeIcon className="size-3.5" />
            )}
            <span className="text-sm">{isFullscreen ? "Exit" : "Full Screen"}</span>
          </button>
          <ExportPopover projectId={projectId} />
          <DeployPopover projectId={projectId} />
        </div>
      </nav>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-11 shrink-0 flex-col items-center border-r bg-sidebar">
          <ActivityButton label="Explorer" icon={FilesIcon} isActive />
          <ActivityButton label="Search" icon={SearchIcon} />
          <ActivityButton label="AI Agent" icon={BotIcon} />
          <ActivityButton label="Run" icon={PlayIcon} />
          <ActivityButton label="Extensions" icon={BoxesIcon} />
        </aside>
        <div className="min-w-0 flex-1">
          <Allotment vertical defaultSizes={isBottomPanelOpen ? [760, 180] : [1]}>
            <Allotment.Pane>
              {activeView === "editor" && (
                <Allotment defaultSizes={[DEFAULT_SIDEBAR_WIDTH, DEFAULT_MAIN_SIZE]}>
                  <Allotment.Pane
                    snap
                    minSize={MIN_SIDEBAR_WIDTH}
                    maxSize={MAX_SIDEBAR_WIDTH}
                    preferredSize={DEFAULT_SIDEBAR_WIDTH}
                  >
                    <FileExplorer projectId={projectId} />
                  </Allotment.Pane>
                  <Allotment.Pane>
                    <EditorView projectId={projectId} />
                  </Allotment.Pane>
                </Allotment>
              )}
              {activeView === "preview" && <PreviewView projectId={projectId} />}
              {activeView === "split" && (
                <Allotment defaultSizes={[350, 650, 650]}>
                  <Allotment.Pane snap minSize={MIN_SIDEBAR_WIDTH} maxSize={MAX_SIDEBAR_WIDTH} preferredSize={DEFAULT_SIDEBAR_WIDTH}>
                    <FileExplorer projectId={projectId} />
                  </Allotment.Pane>
                  <Allotment.Pane minSize={360}>
                    <EditorView projectId={projectId} />
                  </Allotment.Pane>
                  <Allotment.Pane minSize={360}>
                    <PreviewView projectId={projectId} />
                  </Allotment.Pane>
                </Allotment>
              )}
            </Allotment.Pane>
            {isBottomPanelOpen && (
              <Allotment.Pane minSize={120} maxSize={360} preferredSize={180}>
                <BottomPanel
                  openTabsCount={openTabs.length}
                  typeScriptFileCount={typeScriptFileCount}
                />
              </Allotment.Pane>
            )}
          </Allotment>
        </div>
      </div>
      <StatusBar
        activeFileName={activeFile?.name ?? "No file selected"}
        fileCount={files?.length ?? 0}
        lineCount={lineCount}
        view={activeView}
      />
    </div>
  );
};
