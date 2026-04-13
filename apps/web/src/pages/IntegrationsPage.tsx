/**
 * IntegrationsPage - Workspace Integrations Management
 *
 * Allows users to view and manage third-party integrations.
 */
import { useState } from "react";
import {
  Plus,
  Search,
  Plug,
  MoreVertical,
  Trash2,
  Check,
  X,
} from "lucide-react";

interface IntegrationsPageProps {
  workspaceId: string;
  workspaceName: string;
  onBack: () => void;
}

// Static placeholder integrations
const PLACEHOLDER_INTEGRATIONS = [
  {
    id: "github",
    name: "GitHub",
    description: "Access repositories, issues, and pull requests",
    icon: "🐙",
    connected: true,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Manage issues and projects",
    icon: "📋",
    connected: false,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send messages and notifications",
    icon: "💬",
    connected: false,
  },
  {
    id: "notion",
    name: "Notion",
    description: "Access pages and databases",
    icon: "📝",
    connected: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Read and send emails",
    icon: "📧",
    connected: false,
  },
  {
    id: "calendar",
    name: "Google Calendar",
    description: "Manage events and schedules",
    icon: "📅",
    connected: true,
  },
];

export function IntegrationsPage({ workspaceName }: IntegrationsPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  // Filter integrations based on search
  const filteredIntegrations = PLACEHOLDER_INTEGRATIONS.filter((int) =>
    int.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const connectedCount = PLACEHOLDER_INTEGRATIONS.filter((i) => i.connected).length;

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-medium text-zinc-900">Integrations</h1>
          <span className="text-sm text-zinc-400">•</span>
          <span className="text-sm text-zinc-500">{workspaceName}</span>
          {connectedCount > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              {connectedCount} connected
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-zinc-900 text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={1.5} />
          Add Integration
        </button>
      </div>

      {/* Search */}
      <div className="px-6 py-4 border-b border-zinc-100">
        <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg py-2 px-3 w-full max-w-md">
          <Search className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
          <input
            type="text"
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm text-zinc-900 w-full placeholder-zinc-400"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredIntegrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Plug className="w-12 h-12 text-zinc-300 mb-4" strokeWidth={1} />
            <h3 className="text-base font-medium text-zinc-900 mb-1">No integrations found</h3>
            <p className="text-sm text-zinc-500 mb-4">
              {searchQuery ? "Try a different search term" : "Add your first integration"}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 bg-zinc-100 text-zinc-700 text-sm font-medium py-2 px-4 rounded-lg hover:bg-zinc-200 transition-colors"
              >
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                Add Integration
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredIntegrations.map((integration) => (
              <IntegrationCard key={integration.id} integration={integration} />
            ))}
          </div>
        )}
      </div>

      {/* Add Integration Modal */}
      {showAddModal && (
        <AddIntegrationModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}

// ============================================
// Integration Card
// ============================================

interface IntegrationCardProps {
  integration: {
    id: string;
    name: string;
    description: string;
    icon: string;
    connected: boolean;
  };
}

function IntegrationCard({ integration }: IntegrationCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 transition-colors group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white border border-zinc-200 flex items-center justify-center text-lg">
            {integration.icon}
          </div>
          <div>
            <h3 className="text-sm font-medium text-zinc-900">{integration.name}</h3>
            {integration.connected && (
              <span className="text-[10px] text-green-600 flex items-center gap-1">
                <Check className="w-3 h-3" strokeWidth={2} />
                Connected
              </span>
            )}
          </div>
        </div>
        
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center hover:bg-zinc-200 transition-all text-zinc-500"
          >
            <MoreVertical className="w-4 h-4" strokeWidth={1.5} />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-6 w-36 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 z-10">
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                onClick={() => setShowMenu(false)}
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
      
      <p className="text-xs text-zinc-500 mb-3">{integration.description}</p>
      
      <button
        className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
          integration.connected
            ? "bg-zinc-200 text-zinc-600 hover:bg-zinc-300"
            : "bg-zinc-900 text-white hover:bg-zinc-800"
        }`}
      >
        {integration.connected ? "Disconnect" : "Connect"}
      </button>
    </div>
  );
}

// ============================================
// Add Integration Modal
// ============================================

interface AddIntegrationModalProps {
  onClose: () => void;
}

const AVAILABLE_INTEGRATIONS = [
  { id: "jira", name: "Jira", description: "Track issues and projects", icon: "📊" },
  { id: "asana", name: "Asana", description: "Manage team tasks", icon: "✅" },
  { id: "trello", name: "Trello", description: "Organize with boards", icon: "📌" },
  { id: "discord", name: "Discord", description: "Chat and communities", icon: "🎮" },
  { id: "zoom", name: "Zoom", description: "Video meetings", icon: "📹" },
  { id: "figma", name: "Figma", description: "Design collaboration", icon: "🎨" },
];

function AddIntegrationModal({ onClose }: AddIntegrationModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredIntegrations = AVAILABLE_INTEGRATIONS.filter((int) =>
    int.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h2 className="text-base font-medium text-zinc-900">Add Integration</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors text-zinc-500"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg py-2 px-3 w-full">
            <Search className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
            <input
              type="text"
              placeholder="Search available integrations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm text-zinc-900 w-full placeholder-zinc-400"
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-96">
          {filteredIntegrations.length === 0 ? (
            <div className="text-center py-8">
              <Plug className="w-8 h-8 text-zinc-300 mx-auto mb-2" strokeWidth={1} />
              <p className="text-sm text-zinc-500">No integrations found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredIntegrations.map((integration) => (
                <button
                  key={integration.id}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-200 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-lg">
                    {integration.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-zinc-900">{integration.name}</h3>
                    <p className="text-xs text-zinc-500">{integration.description}</p>
                  </div>
                  <Plus className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-zinc-200 bg-zinc-50">
          <button
            onClick={onClose}
            className="text-sm text-zinc-600 hover:text-zinc-900 py-2 px-4 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
