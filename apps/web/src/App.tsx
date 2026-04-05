import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";
import { ChatSidebarContainer, ChatInputContainer, MessageList } from "@/components/chat";
import { RightSidebar } from "@/components/RightSidebar";
import { AuthModal } from "@/components/AuthModal";
import { MoreVertical } from "lucide-react";

function App() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const { currentChat, messages, isStreaming } = useChat();

  // Show auth modal if not logged in
  if (!isLoggedIn && !authLoading) {
    return <AuthModal />;
  }

  // Show loading state
  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-cream flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-[3px] border-gray-200 border-t-coral rounded-full animate-spin" />
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  const isHomeView = !currentChat && messages.length === 0;

  return (
    <div className="relative h-screen flex overflow-hidden bg-zinc-100">
      {/* Left Sidebar - Chat History */}
      <ChatSidebarContainer />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {isHomeView ? (
          /* Home View */
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 overflow-hidden bg-white">
            <div className="mb-8">
              <div className="flex flex-col items-center gap-2">
                <h1 className="font-serif text-[42px] font-normal text-zinc-950 tracking-tight">
                  Come hang with Claude 🤙
                </h1>
                <p className="text-sm text-zinc-600 mt-1 tracking-wide font-light">
                  Powered by Claude Code and Composio
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
              <div className="flex items-center justify-between px-6 py-3.5">
                <h1 className="text-sm font-medium text-zinc-950 tracking-tight">
                  {currentChat?.title || "New chat"}
                </h1>
                <div className="flex items-center gap-2">
                  <button className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors text-zinc-600">
                    <MoreVertical className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <MessageList messages={messages} isStreaming={isStreaming} />

              {/* Input */}
              <ChatInputContainer variant="chat" />
            </div>

            {/* Right Sidebar */}
            <RightSidebar />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;