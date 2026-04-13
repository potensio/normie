/**
 * ChatSidebarContainer - Container component
 *
 * Connects to hooks and passes data to presentational ChatSidebar.
 */
import { useState, useCallback } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { useChats, useChatDelete } from "@/hooks";
import { ChatSidebar } from "./ChatSidebar";
import { SettingsModal } from "../SettingsModal";

export function ChatSidebarContainer() {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const {
    user,
    currentWorkspace,
    workspaces,
    switchWorkspace,
    createWorkspace,
  } = useAuth();

  // Extract chatId from URL
  const currentChatId = routerState.location.pathname.startsWith("/c/")
    ? routerState.location.pathname.split("/c/")[1]
    : null;

  // Fetch chats
  const { data: chats = [] } = useChats(currentWorkspace?.id);

  // Delete mutation
  const { deleteChat: deleteChatAction } = useChatDelete();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const createNewChat = useCallback(() => {
    navigate({ to: "/" });
  }, [navigate]);

  const deleteChat = useCallback(
    async (chatId: string) => {
      await deleteChatAction(chatId);
      if (currentChatId === chatId) {
        navigate({ to: "/" });
      }
    },
    [deleteChatAction, currentChatId, navigate],
  );

  return (
    <>
      <ChatSidebar
        user={user}
        currentWorkspace={currentWorkspace}
        workspaces={workspaces}
        onSwitchWorkspace={switchWorkspace}
        onCreateWorkspace={createWorkspace}
        chats={chats}
        currentChatId={currentChatId}
        onCreateChat={createNewChat}
        onDeleteChat={deleteChat}
        onPrefetchChat={() => {}}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}
