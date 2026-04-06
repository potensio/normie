/**
 * WorkspaceSidebar - Left navigation sidebar
 * 
 * Provides navigation to workspace features:
 * - Workspace list
 * - Skills
 * - Settings
 */
import {
  LayoutGrid,
  Wrench,
  Settings,
  Puzzle,
  ChevronDown,
  Plus,
} from "lucide-react";

interface WorkspaceSidebarProps {
  // Workspace data (static for now)
  currentWorkspace: { id: string; name: string } | null;
  workspaces: { id: string; name: string }[];
  onSwitchWorkspace: (id: string) => void;
  
  // Active view
  activeView: "chat" | "skills" | "integrations" | "settings";
  onViewChange: (view: "chat" | "skills" | "integrations" | "settings") => void;
}

export function WorkspaceSidebar({
  currentWorkspace,
  workspaces,
  onSwitchWorkspace,
  activeView,
  onViewChange,
}: WorkspaceSidebarProps) {
  return (
    <aside className="relative bg-zinc-50 border-r border-zinc-200 p-3 pt-16 gap-2 flex-col w-[72px] flex-shrink-0 flex items-center overflow-y-auto">
      {/* Draggable header area for macOS */}
      <div className="absolute top-0 left-0 right-0 h-12 app-drag-region z-10" />
      
      {/* Workspace Selector (icon only) */}
      <WorkspaceIconSelector
        currentWorkspace={currentWorkspace}
        workspaces={workspaces}
        onSwitchWorkspace={onSwitchWorkspace}
      />

      {/* Divider */}
      <div className="w-8 h-px bg-zinc-200 my-2" />

      {/* Navigation Icons */}
      <nav className="flex flex-col gap-1 w-full">
        <NavButton
          icon={LayoutGrid}
          label="Chat"
          active={activeView === "chat"}
          onClick={() => onViewChange("chat")}
        />
        <NavButton
          icon={Wrench}
          label="Skills"
          active={activeView === "skills"}
          onClick={() => onViewChange("skills")}
        />
        <NavButton
          icon={Puzzle}
          label="Integrations"
          active={activeView === "integrations"}
          onClick={() => onViewChange("integrations")}
        />
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom: Settings */}
      <NavButton
        icon={Settings}
        label="Settings"
        active={activeView === "settings"}
        onClick={() => onViewChange("settings")}
      />
    </aside>
  );
}

// ============================================
// Nav Button
// ============================================

interface NavButtonProps {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}

function NavButton({ icon: Icon, label, active, onClick }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex flex-col items-center gap-1 py-2 rounded-xl transition-colors group ${
        active
          ? "bg-zinc-200 text-zinc-900"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
      }`}
      title={label}
    >
      <Icon className="w-5 h-5" strokeWidth={1.5} />
      <span className="text-[10px] font-medium tracking-wide">{label}</span>
    </button>
  );
}

// ============================================
// Workspace Icon Selector
// ============================================

interface WorkspaceIconSelectorProps {
  currentWorkspace: { id: string; name: string } | null;
  workspaces: { id: string; name: string }[];
  onSwitchWorkspace: (id: string) => void;
}

function WorkspaceIconSelector({
  currentWorkspace,
  workspaces,
  onSwitchWorkspace,
}: WorkspaceIconSelectorProps) {
  const getWorkspaceColor = (name: string) => {
    const colors = [
      "bg-green-400",
      "bg-blue-400",
      "bg-purple-400",
      "bg-pink-400",
      "bg-orange-400",
      "bg-cyan-400",
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <div className="relative group">
      <button
        className={`w-11 h-11 rounded-xl ${currentWorkspace ? getWorkspaceColor(currentWorkspace.name) : "bg-zinc-300"} flex items-center justify-center transition-transform hover:scale-105`}
        title={currentWorkspace?.name || "Select workspace"}
      >
        <span className="text-sm font-medium text-zinc-950">
          {currentWorkspace?.name?.substring(0, 2).toUpperCase() || "WS"}
        </span>
      </button>

      {/* Dropdown on hover */}
      <div className="absolute left-full ml-2 top-0 w-48 bg-white border border-zinc-200 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        <div className="p-1.5">
          <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider px-2 py-1">
            Workspaces
          </div>
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              onClick={() => onSwitchWorkspace(workspace.id)}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors text-left ${
                currentWorkspace?.id === workspace.id
                  ? "bg-zinc-100"
                  : "hover:bg-zinc-50"
              }`}
            >
              <div className={`w-6 h-6 rounded-md ${getWorkspaceColor(workspace.name)} flex items-center justify-center flex-shrink-0`}>
                <span className="text-[10px] font-medium text-zinc-950">
                  {workspace.name.substring(0, 2).toUpperCase()}
                </span>
              </div>
              <span className="text-sm text-zinc-900 truncate flex-1">
                {workspace.name}
              </span>
            </button>
          ))}
          
          {/* Create new workspace */}
          <div className="border-t border-zinc-100 mt-1 pt-1">
            <button className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-zinc-50 transition-colors text-left">
              <div className="w-6 h-6 rounded-md bg-zinc-100 flex items-center justify-center flex-shrink-0">
                <Plus size={14} className="text-zinc-500" />
              </div>
              <span className="text-sm text-zinc-600">New workspace</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}