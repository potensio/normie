/**
 * ChatSidebar - Presentational component
 * 
 * Pure UI component with no context access. All data and actions come from props.
 */
import { useState, useRef, useEffect } from "react";
import {
  Search,
  PenSquare,
  Settings,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

interface ChatSidebarProps {
  // User data
  user: { displayName?: string; email: string } | null;

  // Workspace data
  currentWorkspace: { id: string; name: string } | null;
  workspaces: { id: string; name: string }[];
  onSwitchWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string, description?: string) => Promise<unknown>;

  // Chat data
  chats: { id: string; title: string }[];
  currentChatId: string | null;
  onLoadChat: (id: string) => void;
  onCreateChat: () => void;
  onDeleteChat: (id: string) => void;
  onPrefetchChat?: (id: string) => void;

  // Settings
  onOpenSettings: () => void;
}

export function ChatSidebar({
  user,
  currentWorkspace,
  workspaces,
  onSwitchWorkspace,
  onCreateWorkspace,
  chats,
  currentChatId,
  onLoadChat,
  onCreateChat,
  onDeleteChat,
  onPrefetchChat,
  onOpenSettings,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter chats based on search query
  const filteredChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user) return "U";
    const name = user.displayName || user.email;
    return name.substring(0, 2).toUpperCase();
  };

  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    onDeleteChat(chatId);
    setOpenDropdown(null);
  };

  const toggleDropdown = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    setOpenDropdown(openDropdown === chatId ? null : chatId);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <aside className="relative bg-white border-r border-zinc-200 p-4 pt-16 gap-3 flex-col w-[280px] flex-shrink-0 flex overflow-y-auto">
      {/* Draggable header area for macOS */}
      <div className="absolute top-0 left-0 right-0 h-12 app-drag-region z-10" />
      {/* Workspace Selector */}
      <WorkspaceSelector
        currentWorkspace={currentWorkspace}
        workspaces={workspaces}
        onSwitchWorkspace={onSwitchWorkspace}
        onCreateWorkspace={onCreateWorkspace}
      />

      {/* New Chat Button */}
      <button
        onClick={onCreateChat}
        className="flex items-center gap-1.5 bg-zinc-100 rounded-full py-1.5 px-3 hover:bg-zinc-200 transition-colors w-full justify-center"
      >
        <PenSquare className="w-3.5 h-3.5 text-zinc-600" strokeWidth={1.5} />
        <span className="text-[0.9375rem] text-zinc-600 font-light">New Chat</span>
      </button>

      {/* Search */}
      <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 w-full">
        <Search className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent border-none outline-none text-[0.9375rem] text-zinc-900 w-full placeholder-zinc-400 font-light"
        />
      </div>

      {/* Conversation List */}
      <div className="flex flex-col gap-0.5 flex-1 overflow-y-auto">
        {filteredChats.length === 0 ? (
          <div className="p-4 text-center text-zinc-400 text-[0.9375rem] font-light">
            {searchQuery ? "No chats found" : "No chats yet"}
          </div>
        ) : (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              onMouseEnter={() => onPrefetchChat?.(chat.id)}
              className={`group relative flex items-center gap-2 rounded-xl py-2 pl-3 pr-2 transition-colors ${
                currentChatId === chat.id ? "bg-zinc-100" : "hover:bg-zinc-50"
              }`}
            >
              {/* Chat title - clickable */}
              <button
                onClick={() => onLoadChat(chat.id)}
                className="flex-1 text-left min-w-0 flex items-center gap-2"
              >
                {/* Active indicator dot */}
                {currentChatId === chat.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"></div>
                )}
                <span
                  className={`text-[0.9375rem] tracking-tight truncate block ${
                    currentChatId === chat.id
                      ? "font-medium text-zinc-950"
                      : "font-light text-zinc-600"
                  }`}
                >
                  {chat.title}
                </span>
              </button>

              {/* Three dots dropdown button - shows on hover */}
              <div
                className="relative flex-shrink-0"
                ref={openDropdown === chat.id ? dropdownRef : null}
              >
                <button
                  onClick={(e) => toggleDropdown(e, chat.id)}
                  className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center hover:bg-zinc-200 transition-all text-zinc-500 hover:text-zinc-700"
                  title="Options"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>

                {/* Dropdown menu */}
                {openDropdown === chat.id && (
                  <div className="absolute right-0 top-8 w-40 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 z-50">
                    <button
                      onClick={(e) => handleDeleteChat(e, chat.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[0.9375rem] font-light text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Settings */}
      <button
        onClick={onOpenSettings}
        className="flex items-center gap-2.5 hover:bg-zinc-50 rounded-xl p-2 w-full transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-cyan-400 flex items-center justify-center flex-shrink-0">
          <span className="text-[0.9375rem] font-medium text-zinc-950">
            {getUserInitials()}
          </span>
        </div>
        <div className="flex flex-col flex-1 min-w-0 text-left">
          <span className="text-[0.9375rem] font-normal text-zinc-950 truncate">
            {user?.displayName || user?.email?.split("@")[0] || "User"}
          </span>
        </div>
        <Settings
          className="w-4 h-4 text-zinc-400 flex-shrink-0"
          strokeWidth={1.5}
        />
      </button>
    </aside>
  );
}

// ============================================
// Workspace Selector (internal presentational)
// ============================================

interface WorkspaceSelectorProps {
  currentWorkspace: { id: string; name: string } | null;
  workspaces: { id: string; name: string }[];
  onSwitchWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string, description?: string) => Promise<unknown>;
}

function WorkspaceSelector({
  currentWorkspace,
  workspaces,
  onSwitchWorkspace,
  onCreateWorkspace,
}: WorkspaceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
        setNewWorkspaceName('');
        setError(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when creating
  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  // Get workspace initials for avatar
  const getWorkspaceInitials = () => {
    if (!currentWorkspace) return 'WS';
    return currentWorkspace.name.substring(0, 2).toUpperCase();
  };

  // Get a color based on workspace name
  const getWorkspaceColor = () => {
    if (!currentWorkspace) return 'bg-gray-400';
    const colors = [
      'bg-green-400',
      'bg-blue-400',
      'bg-purple-400',
      'bg-pink-400',
      'bg-orange-400',
      'bg-cyan-400',
    ];
    const index = currentWorkspace.name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const handleSelectWorkspace = (workspaceId: string) => {
    if (workspaceId === currentWorkspace?.id) {
      setIsOpen(false);
      return;
    }
    
    onSwitchWorkspace(workspaceId);
    setIsOpen(false);
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setError(null);
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewWorkspaceName('');
    setError(null);
  };

  const handleCreateWorkspace = async () => {
    const name = newWorkspaceName.trim();
    if (!name) {
      setError('Workspace name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onCreateWorkspace(name);
      setIsCreating(false);
      setIsOpen(false);
      setNewWorkspaceName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateWorkspace();
    } else if (e.key === 'Escape') {
      handleCancelCreate();
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 hover:bg-zinc-50 rounded-xl px-2 py-1.5 -mx-2 transition-colors flex-1"
      >
        <div className={`w-7 h-7 rounded-lg ${getWorkspaceColor()} flex items-center justify-center flex-shrink-0`}>
          <span className="text-[0.9375rem] font-medium text-zinc-950">
            {getWorkspaceInitials()}
          </span>
        </div>
        <div className="flex flex-col flex-1 min-w-0 text-left">
          <span className="text-[0.9375rem] font-medium text-zinc-950 truncate tracking-tight">
            {currentWorkspace?.name || 'Select workspace'}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg p-1.5 z-50 min-w-[200px]">
          {isCreating ? (
            <div className="p-2">
              <input
                ref={inputRef}
                type="text"
                placeholder="Workspace name"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSubmitting}
                className="w-full text-[0.9375rem] bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-coral/20 focus:border-coral transition-all"
                autoFocus
              />
              {error && (
                <p className="text-[0.9375rem] text-red-500 mt-1.5">{error}</p>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleCancelCreate}
                  disabled={isSubmitting}
                  className="flex-1 text-[0.9375rem] text-zinc-600 hover:text-zinc-900 py-1.5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateWorkspace}
                  disabled={isSubmitting || !newWorkspaceName.trim()}
                  className="flex-1 bg-zinc-900 text-white text-[0.9375rem] py-1.5 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Creating
                    </>
                  ) : (
                    'Create'
                  )}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Workspace list */}
              <div className="max-h-48 overflow-y-auto">
                {workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    onClick={() => handleSelectWorkspace(workspace.id)}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors text-left ${
                      currentWorkspace?.id === workspace.id
                        ? 'bg-zinc-100'
                        : 'hover:bg-zinc-50'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-md ${currentWorkspace?.id === workspace.id ? getWorkspaceColor() : 'bg-zinc-200'} flex items-center justify-center flex-shrink-0`}>
                      <span className="text-[10px] font-medium text-zinc-950">
                        {workspace.name.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-[0.9375rem] text-zinc-900 truncate flex-1">
                      {workspace.name}
                    </span>
                    {currentWorkspace?.id === workspace.id && (
                      <Check size={16} className="text-coral flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {/* Create new workspace */}
              {workspaces.length > 0 && (
                <div className="border-t border-zinc-100 mt-1 pt-1">
                  <button
                    onClick={handleStartCreate}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-zinc-50 transition-colors text-left"
                  >
                    <div className="w-6 h-6 rounded-md bg-zinc-100 flex items-center justify-center flex-shrink-0">
                      <Plus size={14} className="text-zinc-500" />
                    </div>
                    <span className="text-[0.9375rem] text-zinc-600">New workspace</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Import icons used by WorkspaceSelector
import { ChevronDown, Check, Plus, Loader2 } from 'lucide-react';