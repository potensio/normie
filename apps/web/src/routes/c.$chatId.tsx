/**
 * Chat Route - /c/:chatId
 * 
 * Displays a specific chat conversation.
 * The chatId parameter identifies which chat to load.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useChat } from '@/contexts/ChatContext'
import { ChatInputContainer, MessageList } from '@/components/chat'

export const Route = createFileRoute('/c/$chatId')({
  component: ChatComponent,
  // Validate chatId parameter
  params: {
    parse: (params) => ({
      chatId: params.chatId as string,
    }),
    stringify: ({ chatId }) => ({ chatId }),
  },
})

function ChatComponent() {
  const { chatId } = Route.useParams()
  const { messages, isStreaming, currentChat, loadChat } = useChat()

  // Load the chat when the route mounts or chatId changes
  useEffect(() => {
    if (chatId && currentChat?.id !== chatId) {
      loadChat(chatId)
    }
  }, [chatId, currentChat?.id, loadChat])

  // Verify the current chat matches the URL
  const isActiveChat = currentChat?.id === chatId

  return (
    <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-white">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-white">
        <h1 className="text-sm font-medium text-text-primary tracking-tight">
          {currentChat?.title || 'New chat'}
        </h1>
      </div>

      {/* Messages */}
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        chatId={chatId}
      />

      {/* Input */}
      <ChatInputContainer variant="chat" />
    </div>
  )
}
