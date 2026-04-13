/**
 * Home Route - / (New Chat)
 *
 * Shows the home view with tagline and chat input.
 * This is the default view when no chat is selected.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useChatContext } from "@/hooks";
import { ChatInputLogic } from "@/components/chat/ChatInputLogic";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const { isStreaming, startStream, stopStream } = useChatContext();

  // Random tagline for home view
  const tagline = useMemo(() => {
    const taglines = [
      "What's next wizard?",
      "Press enter and let's conquer the world.",
      "Ring ring! Your keyboard called.",
      "Your projects called, they miss you.",
      "Tell me something, so you can scrolling.",
      "Ready to feel like a genius?",
      "Your to-do list is shaking right now.",
      "Let's turn that brain energy into brilliance.",
      "Time to earn that coffee.",
      "Ready when you are, legend.",
    ];
    return taglines[Math.floor(Math.random() * taglines.length)];
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 overflow-hidden bg-white">
      <div className="mb-8">
        <div className="flex flex-col items-center gap-2">
          <h1 className="font-accent text-4xl font-normal text-text-primary tracking-tighter">
            {tagline}
          </h1>
          <p className="text-sm text-text-tertiary mt-1 tracking-wide font-light">
            Automate across 1,000+ apps
          </p>
        </div>
      </div>
      <ChatInputLogic
        variant="home"
        chatId={null}
        isStreaming={isStreaming}
        startStream={startStream}
        stopStream={stopStream}
      />
    </div>
  );
}
