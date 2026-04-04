import {
  Search,
  PenSquare,
  Settings,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useChat } from "@/contexts/ChatContext";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useRef, useEffect } from "react";
import { SettingsModal } from "./SettingsModal";
import { WorkspaceDropdown } from "./WorkspaceDropdown";

export function ChatSidebar() {
  const { chats, currentChat, loadChat, createNewChat, deleteChat } = useChat();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
    if (window.confirm("Are you sure you want to delete this chat?")) {
      deleteChat(chatId);
      setOpenDropdown(null);
    }
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
    <aside className="bg-white border-r border-zinc-200 p-4 pt-16 gap-4 flex-col w-[240px] flex-shrink-0 flex overflow-y-auto">
      {/* Workspace Selector */}
      <WorkspaceDropdown />

      {/* New Chat Button */}
      <button
        onClick={createNewChat}
        className="flex items-center gap-1.5 bg-zinc-100 rounded-full py-1.5 px-3 hover:bg-zinc-200 transition-colors w-full justify-center"
      >
        <PenSquare className="w-3.5 h-3.5 text-zinc-600" strokeWidth={1.5} />
        <span className="text-xs text-zinc-600 font-light">New Chat</span>
      </button>

      {/* Search */}
      <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 w-full">
        <Search className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent border-none outline-none text-xs text-zinc-900 w-full placeholder-zinc-400 font-light"
        />
      </div>

      {/* Conversation List */}
      <div className="flex flex-col gap-0.5 flex-1 overflow-y-auto">
        {filteredChats.length === 0 ? (
          <div className="p-4 text-center text-zinc-400 text-xs font-light">
            {searchQuery ? "No chats found" : "No chats yet"}
          </div>
        ) : (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              className={`group relative flex items-center gap-2 rounded-xl py-2 pl-3 pr-2 transition-colors ${
                currentChat?.id === chat.id ? "bg-zinc-100" : "hover:bg-zinc-50"
              }`}
            >
              {/* Chat title - clickable */}
              <button
                onClick={() => loadChat(chat.id)}
                className="flex-1 text-left min-w-0 flex items-center gap-2"
              >
                {/* Active indicator dot */}
                {currentChat?.id === chat.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"></div>
                )}
                <span
                  className={`text-sm tracking-tight truncate block ${
                    currentChat?.id === chat.id
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
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm font-light text-red-600 hover:bg-red-50 transition-colors"
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
        onClick={() => setIsSettingsOpen(true)}
        className="flex items-center gap-2.5 hover:bg-zinc-50 rounded-xl p-2 w-full transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-cyan-400 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-medium text-zinc-950">
            {getUserInitials()}
          </span>
        </div>
        <div className="flex flex-col flex-1 min-w-0 text-left">
          <span className="text-sm font-normal text-zinc-950 truncate">
            {user?.displayName || user?.email?.split("@")[0] || "User"}
          </span>
        </div>
        <Settings
          className="w-4 h-4 text-zinc-400 flex-shrink-0"
          strokeWidth={1.5}
        />
      </button>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </aside>
  );
}
