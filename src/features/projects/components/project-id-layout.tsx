"use client";

import { Allotment } from "allotment";

import { ConversationSidebar } from "@/features/conversations/components/conversation-sidebar";

import { Navbar } from "./navbar";
import { Id } from "../../../../convex/_generated/dataModel";
import { FullscreenProvider, useFullscreen } from "./fullscreen-context";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 800;
const DEFAULT_CONVERSATION_SIDEBAR_WIDTH = 400;
const DEFAULT_MAIN_SIZE = 1000;

const FULLSCREEN_SIDEBAR_WIDTH = 320;
const FULLSCREEN_MAIN_SIZE = 1400;

const LayoutContent = ({
  children,
  projectId,
}: {
  children: React.ReactNode;
  projectId: Id<"projects">;
}) => {
  const { isFullscreen } = useFullscreen();

  return (
    <div className="w-full h-screen flex flex-col">
      <Navbar projectId={projectId} />
      <div className="flex-1 flex overflow-hidden">
        {isFullscreen ? (
          <Allotment
            key="fullscreen"
            className="flex-1"
            defaultSizes={[FULLSCREEN_MAIN_SIZE, FULLSCREEN_SIDEBAR_WIDTH]}
          >
            <Allotment.Pane>
              {children}
            </Allotment.Pane>
            <Allotment.Pane
              snap
              minSize={MIN_SIDEBAR_WIDTH}
              maxSize={MAX_SIDEBAR_WIDTH}
              preferredSize={FULLSCREEN_SIDEBAR_WIDTH}
            >
              <ConversationSidebar projectId={projectId} />
            </Allotment.Pane>
          </Allotment>
        ) : (
          <Allotment
            key="normal"
            className="flex-1"
            defaultSizes={[
              DEFAULT_CONVERSATION_SIDEBAR_WIDTH,
              DEFAULT_MAIN_SIZE,
            ]}
          >
            <Allotment.Pane
              snap
              minSize={MIN_SIDEBAR_WIDTH}
              maxSize={MAX_SIDEBAR_WIDTH}
              preferredSize={DEFAULT_CONVERSATION_SIDEBAR_WIDTH}
            >
              <ConversationSidebar projectId={projectId} />
            </Allotment.Pane>
            <Allotment.Pane>
              {children}
            </Allotment.Pane>
          </Allotment>
        )}
      </div>
    </div>
  );
};

export const ProjectIdLayout = ({
  children,
  projectId,
}: {
  children: React.ReactNode;
  projectId: Id<"projects">;
}) => {
  return (
    <FullscreenProvider>
      <LayoutContent projectId={projectId}>
        {children}
      </LayoutContent>
    </FullscreenProvider>
  );
};
