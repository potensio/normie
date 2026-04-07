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

export function ChatSidebarContainer() {
  const { chats, currentChat, createNewChat, deleteChat, prefetchChat } = useChat();
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
        chats={chats}
        currentChatId={currentChat?.id ?? null}
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
