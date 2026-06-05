import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import ky from "ky";

import { inngest } from "@/inngest/client";
import {
  ownershipDeniedResponse,
  verifyConversationOwnership,
} from "@/lib/authorize-resource";
import { convex } from "@/lib/convex-client";
import { getPostHogClient } from "@/lib/posthog-server";
import { filterAllowedUploadUrls, isAllowedUploadUrl } from "@/lib/url-safety";

import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

const requestSchema = z.object({
  conversationId: z.string(),
  message: z.string(),
  imageUrls: z.array(z.string().url()).max(5).optional().default([]),
  pdfUrls: z.array(z.string().url()).max(1).optional().default([]),
});

async function extractPdfText(pdfUrl: string): Promise<string> {
  try {
    const pdfBuffer = await ky.get(pdfUrl).arrayBuffer();
    const pdfParse = await import("pdf-parse").then((m: any) => m.default || m);
    const result = await pdfParse(Buffer.from(pdfBuffer));
    return result.text;
  } catch (error) {
    console.error("Failed to extract PDF text:", error);
    return "[Unable to extract text from PDF]";
  }
}

export const maxDuration = 60;

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;

  if (!internalKey) {
    return NextResponse.json(
      { error: "Internal key not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { conversationId, message, imageUrls, pdfUrls } = requestSchema.parse(body);

  const ownership = await verifyConversationOwnership(
    convex,
    conversationId,
    userId
  );
  if (!ownership.ok) {
    return ownershipDeniedResponse(ownership);
  }

  const safePdfUrls = filterAllowedUploadUrls(pdfUrls);
  if (pdfUrls.length > 0 && safePdfUrls.length !== pdfUrls.length) {
    return NextResponse.json(
      { error: "One or more PDF URLs are not allowed" },
      { status: 400 }
    );
  }

  if (imageUrls.length > 0 && !imageUrls.every(isAllowedUploadUrl)) {
    return NextResponse.json(
      { error: "One or more image URLs are not allowed" },
      { status: 400 }
    );
  }

  // Call convex mutation, query
  const conversation = await convex.query(api.system.getConversationById, {
    internalKey,
    conversationId: conversationId as Id<"conversations">,
  });

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const projectId = conversation.projectId;

  // Find all processing messages in this project
  const processingMessages = await convex.query(
    api.system.getProcessingMessages,
    {
      internalKey,
      projectId,
    }
  );

  if (processingMessages.length > 0) {
    // Cancel all processing messages
    await Promise.all(
      processingMessages.map(async (msg) => {
        await inngest.send({
          name: "message/cancel",
          data: {
            messageId: msg._id,
          },
        });

        await convex.mutation(api.system.updateMessageStatus, {
          internalKey,
          messageId: msg._id,
          status: "cancelled",
        });
      })
    );
  }

  // Extract text from PDFs if any
  let combinedMessage = message;
  if (safePdfUrls.length > 0) {
    const pdfTexts = await Promise.all(
      safePdfUrls.map(async (url) => {
        const text = await extractPdfText(url);
        return `--- PDF Content ---\n${text}\n--- End PDF ---`;
      })
    );
    
    // Prepend PDF content to the user's message
    const pdfContent = pdfTexts.join("\n\n");
    combinedMessage = `${pdfContent}\n\n${message || "Please use the information from the PDF above."}`;
  }

  // Create user message
  await convex.mutation(api.system.createMessage, {
    internalKey,
    conversationId: conversationId as Id<"conversations">,
    projectId,
    role: "user",
    content: combinedMessage,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
  });

  // Create assistant message placeholder with processing status
  const assistantMessageId = await convex.mutation(
    api.system.createMessage,
    {
      internalKey,
      conversationId: conversationId as Id<"conversations">,
      projectId,
      role: "assistant",
      content: "",
      status: "processing",
    }
  );

  // Trigger Inngest to process the message
  const event = await inngest.send({
    name: "message/sent",
    data: {
      messageId: assistantMessageId,
      conversationId,
      projectId,
      message: combinedMessage,
      imageUrls,
    },
  });

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: userId,
    event: "ai_message_sent",
    properties: {
      project_id: projectId,
      conversation_id: conversationId,
      has_images: imageUrls.length > 0,
    },
  });
  await posthog.shutdown();

  return NextResponse.json({
    success: true,
    eventId: event.ids[0],
    messageId: assistantMessageId,
  });
};
