/**
 * Chat Route - /c/:chatId
 *
 * Displays a specific chat conversation.
 * Route acts as container - holds streaming state and passes to children.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCurrentChat, useChatContext } from "@/hooks";
import { MessageList } from "@/components/chat";
import { ChatInputLogic } from "@/components/chat/ChatInputLogic";

export const Route = createFileRoute("/c/$chatId")({
  component: ChatComponent,
  // Validate chatId parameter
  params: {
    parse: (params) => ({
      chatId: params.chatId as string,
    }),
    stringify: ({ chatId }) => ({ chatId }),
  },
});

function ChatComponent() {
  const { chatId } = Route.useParams();
  const { data: chat, isLoading } = useCurrentChat(chatId);
  const { isStreaming, startStream, stopStream } = useChatContext();

  const messages = chat?.messages || [];

  return (
    <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-white">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-white">
        <h1 className="text-sm font-medium text-text-primary tracking-tight">
          Chat
        </h1>
      </div>

      {/* Messages */}
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        chatId={chatId}
      />

      {/* Input with logic */}
      <ChatInputLogic
        variant="chat"
        chatId={chatId}
        isStreaming={isStreaming}
        startStream={startStream}
        stopStream={stopStream}
      />
    </div>
  );
}
