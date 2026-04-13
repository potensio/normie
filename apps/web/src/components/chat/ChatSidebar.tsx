/**
 * ChatSidebar - Presentational component
 * 
 * Pure UI component with no context access. All data and actions come from props.
 * Uses TanStack Router for navigation.
 */
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  MagnifyingGlass,
  PencilSimpleLine,
  Gear,
  DotsThree,
  Trash,
  PuzzlePiece,
  Plugs,
  CaretDown,
  Check,
  Plus,
  SpinnerGap,
} from "@phosphor-icons/react";

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
  onCreateChat,
  onDeleteChat,
  onPrefetchChat,
  onOpenSettings,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Filter chats based on search query
  const filteredChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Determine active state from URL
  const pathname = location.pathname;
  const isHomeActive = pathname === '/';
  const isChatActive = pathname.startsWith('/c/');
  const isSkillsActive = pathname.startsWith('/skills');
  const isIntegrationsActive = pathname.startsWith('/integrations');
  const isAnyChatActive = isHomeActive || isChatActive;

  const getUserInitials = () => {
    if (!user) return "U";
    const name = user.displayName || user.email;
    return name.substring(0, 2).toUpperCase();
  };

  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    e.preventDefault();
    onDeleteChat(chatId);
    setOpenDropdown(null);
  };

  return (
    <aside className="relative bg-white border-r border-zinc-200 flex flex-col w-[280px] flex-shrink-0 h-screen overflow-hidden">
      {/* Draggable header area for macOS */}
      <div className="absolute top-0 left-0 right-0 h-8 app-drag-region z-10" />

      {/* Top Section: Workspace + Menu */}
      <div className="pt-10 px-3 pb-3 space-y-1">
        <WorkspaceSelector
          currentWorkspace={currentWorkspace}
          workspaces={workspaces}
          onSwitchWorkspace={onSwitchWorkspace}
          onCreateWorkspace={onCreateWorkspace}
        />

        {/* Menu Items */}
        <nav className="space-y-0.5">
          <Link 
            to="/"
            onClick={onCreateChat}
            className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${
              isAnyChatActive ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            <PencilSimpleLine className="w-4 h-4" weight="duotone" />
            <span className="text-sm font-light">New Chat</span>
          </Link>
          
          <Link 
            to="/skills"
            className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${
              isSkillsActive ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            <PuzzlePiece className="w-4 h-4" weight="duotone" />
            <span className="text-sm font-light">Skills</span>
          </Link>
          
          <Link 
            to="/integrations"
            className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${
              isIntegrationsActive ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            <Plugs className="w-4 h-4" weight="duotone" />
            <span className="text-sm font-light">Integrations</span>
          </Link>
        </nav>
      </div>

      {/* Separator */}
      <div className="mx-3 h-px bg-zinc-200" />

      {/* Chat History */}
      <div className="flex-1 flex flex-col min-h-0 px-3 py-3">
        <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg py-2 px-3 w-full mb-2">
          <MagnifyingGlass className="w-3.5 h-3.5 text-zinc-400" weight="duotone" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm text-zinc-900 w-full placeholder-zinc-400 font-light"
          />
        </div>

        <div className="flex flex-col gap-0.5 flex-1 overflow-y-auto">
          {filteredChats.length === 0 ? (
            <div className="p-4 text-center text-zinc-400 text-sm font-light">
              {searchQuery ? "No chats found" : "No chats yet"}
            </div>
          ) : (
            filteredChats.map((chat) => (
              <Link
                key={chat.id}
                to="/c/$chatId"
                params={{ chatId: chat.id }}
                onMouseEnter={() => onPrefetchChat?.(chat.id)}
                preload="intent"
                className={`group relative flex items-center gap-2 rounded-lg py-2 px-2 transition-colors ${
                  currentChatId === chat.id ? "bg-zinc-100" : "hover:bg-zinc-50"
                }`}
              >
                {currentChatId === chat.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                )}
                <span className={`flex-1 text-left text-sm tracking-tight truncate block ${
                  currentChatId === chat.id ? "font-medium text-zinc-950" : "font-light text-zinc-600"
                }`}>
                  {chat.title}
                </span>

                <div
                  className="relative flex-shrink-0"
                  ref={openDropdown === chat.id ? dropdownRef : null}
                  onClick={(e) => e.preventDefault()}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setOpenDropdown(openDropdown === chat.id ? null : chat.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center hover:bg-zinc-200 transition-all text-zinc-500 hover:text-zinc-700"
                    title="Options"
                  >
                    <DotsThree className="w-3.5 h-3.5" weight="duotone" />
                  </button>

                  {openDropdown === chat.id && (
                    <div className="absolute right-0 top-8 w-40 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 z-50">
                      <button
                        onClick={(e) => handleDeleteChat(e, chat.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-light text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash className="w-3.5 h-3.5" weight="duotone" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* User Profile */}
      <div className="border-t border-zinc-100 px-3 py-3">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 hover:bg-zinc-50 rounded-lg px-1 py-1 -mx-1 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-cyan-400 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-medium text-zinc-950">{getUserInitials()}</span>
          </div>
          <div className="flex flex-col flex-1 min-w-0 text-left">
            <span className="text-sm font-normal text-zinc-950 truncate">
              {user?.displayName || user?.email?.split("@")[0] || "User"}
            </span>
            <span className="text-xs text-zinc-400 truncate">{user?.email}</span>
          </div>
          <Gear className="w-4 h-4 text-zinc-400 flex-shrink-0" weight="duotone" />
        </button>
      </div>
    </aside>
  );
}

// Simplified WorkspaceSelector without MenuItem dependency
function WorkspaceSelector({
  currentWorkspace,
  workspaces,
  onSwitchWorkspace,
  onCreateWorkspace,
}: {
  currentWorkspace: { id: string; name: string } | null;
  workspaces: { id: string; name: string }[];
  onSwitchWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string, description?: string) => Promise<unknown>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
        setNewWorkspaceName("");
        setError(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  const getWorkspaceInitials = () => {
    if (!currentWorkspace) return "WS";
    return currentWorkspace.name.substring(0, 2).toUpperCase();
  };

  const getWorkspaceColor = () => {
    if (!currentWorkspace) return "bg-gray-400";
    const colors = ["bg-green-400", "bg-blue-400", "bg-purple-400", "bg-pink-400", "bg-orange-400", "bg-cyan-400"];
    const index = currentWorkspace.name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const handleCreateWorkspace = async () => {
    const name = newWorkspaceName.trim();
    if (!name) {
      setError("Workspace name is required");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onCreateWorkspace(name);
      setIsCreating(false);
      setIsOpen(false);
      setNewWorkspaceName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreateWorkspace();
    } else if (e.key === "Escape") {
      setIsCreating(false);
      setNewWorkspaceName("");
      setError(null);
    }
  };

  const handleSwitchWorkspace = (workspaceId: string) => {
    onSwitchWorkspace(workspaceId);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 hover:bg-zinc-50 rounded-lg px-2 py-2 transition-colors"
      >
        <div className={`w-7 h-7 rounded-lg ${getWorkspaceColor()} flex items-center justify-center flex-shrink-0`}>
          <span className="text-sm font-medium text-zinc-950">{getWorkspaceInitials()}</span>
        </div>
        <span className="text-sm font-medium text-zinc-950 truncate flex-1 text-left tracking-tight">
          {currentWorkspace?.name || "Select workspace"}
        </span>
        <CaretDown className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} weight="duotone" />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg p-1.5 z-50">
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
                className="w-full text-sm bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-coral/20 focus:border-coral transition-all"
                autoFocus
              />
              {error && <p className="text-sm text-red-500 mt-1.5">{error}</p>}
              <div className="flex gap-2 mt-2">
                <button 
                  onClick={() => { setIsCreating(false); setNewWorkspaceName(""); setError(null); }} 
                  className="flex-1 text-sm text-zinc-600 hover:text-zinc-900 py-1.5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreateWorkspace} 
                  disabled={isSubmitting || !newWorkspaceName.trim()} 
                  className="flex-1 bg-zinc-900 text-white text-sm py-1.5 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {isSubmitting ? <><SpinnerGap className="w-3 h-3 animate-spin" weight="duotone" /> Creating</> : "Create"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="max-h-48 overflow-y-auto">
                {workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    onClick={() => handleSwitchWorkspace(workspace.id)}
                    className="w-full flex items-center gap-2 px-2 py-2 hover:bg-zinc-50 rounded-lg transition-colors text-left"
                  >
                    <div className="w-5 h-5 rounded bg-green-400 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-zinc-950">
                        {workspace.name.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-light text-zinc-900 truncate flex-1">
                      {workspace.name}
                    </span>
                    {currentWorkspace?.id === workspace.id && (
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0" weight="bold" />
                    )}
                  </button>
                ))}
              </div>
              
              <div className="border-t border-zinc-100 mt-1 pt-1">
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full flex items-center gap-2 px-2 py-2 hover:bg-zinc-50 rounded-lg transition-colors text-left"
                >
                  <div className="w-5 h-5 rounded bg-zinc-100 flex items-center justify-center flex-shrink-0">
                    <Plus className="w-3 h-3 text-zinc-600" weight="bold" />
                  </div>
                  <span className="text-sm font-light text-zinc-600">
                    Create new workspace
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
