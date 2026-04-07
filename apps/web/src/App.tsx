import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";
import {
  ChatSidebarContainer,
  ChatInputContainer,
  MessageList,
} from "@/components/chat";

import { AuthPage } from "@/pages/AuthPage";
import { SkillsPage } from "@/pages/SkillsPage";


type ViewType = "chat" | "skills";

function App() {
  const { isLoggedIn, isLoading: authLoading, currentWorkspace } = useAuth();
  const { currentChat, messages, isStreaming } = useChat();

  const [activeView, setActiveView] = useState<ViewType>("chat");

  // Random tagline for home view - must be before early returns (React hooks rule)
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

  const isHomeView = !currentChat && messages.length === 0 && activeView === "chat";

  // Show auth page if not logged in
  if (!isLoggedIn && !authLoading) {
    return <AuthPage />;
  }

  // Show loading state
  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-bg-base flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-[3px] border-purple-400/30 border-t-purple-500 rounded-full animate-spin" />
        <p className="text-text-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="relative h-screen flex overflow-hidden bg-zinc-50">
      {/* Left Sidebar - Consolidated with workspace, nav, and chat history */}
      <ChatSidebarContainer
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {activeView === "skills" ? (
          /* Skills & Integrations Page */
          <SkillsPage
            workspaceId={currentWorkspace?.id || ""}
            workspaceName={currentWorkspace?.name || "Unknown"}
            onBack={() => setActiveView("chat")}
          />
        ) : isHomeView ? (
          /* Home View */
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

            <ChatInputContainer variant="home" />
          </div>
        ) : (
          /* Chat View */
          <div className="flex-1 flex h-screen overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-white">
              {/* Chat Header */}
              <div className="flex items-center justify-between px-6 py-3.5 bg-white">
                <h1 className="text-sm font-medium text-text-primary tracking-tight">
                  {currentChat?.title || "New chat"}
                </h1>

              </div>

              {/* Messages */}
              <MessageList
                messages={messages}
                isStreaming={isStreaming}
                chatId={currentChat?.id}
              />

              {/* Input */}
              <ChatInputContainer variant="chat" />
            </div>


          </div>
        )}
      </div>
    </div>
  );
}

export default App;