/**
 * ChatSidebarContainer - Container component
 * 
 * Connects to context and passes data to presentational ChatSidebar.
 */
import { useState } from 'react';
import { useChat } from '@/contexts/ChatContext';
import { useAuth } from '@/contexts/AuthContext';
import { ChatSidebar } from './ChatSidebar';
import { SettingsModal } from '../SettingsModal';

interface ChatSidebarContainerProps {
  activeView: "chat" | "skills";
  onViewChange: (view: "chat" | "skills") => void;
}

export function ChatSidebarContainer({ activeView, onViewChange }: ChatSidebarContainerProps) {
  const { chats, currentChat, loadChat, createNewChat, deleteChat, prefetchChat } = useChat();
  const { user, currentWorkspace, workspaces, switchWorkspace, createWorkspace } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <ChatSidebar
        user={user}
        currentWorkspace={currentWorkspace}
        workspaces={workspaces}
        onSwitchWorkspace={switchWorkspace}
        onCreateWorkspace={createWorkspace}
        activeView={activeView}
        onViewChange={onViewChange}
        chats={chats}
        currentChatId={currentChat?.id ?? null}
        onLoadChat={loadChat}
        onCreateChat={createNewChat}
        onDeleteChat={deleteChat}
        onPrefetchChat={prefetchChat}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}