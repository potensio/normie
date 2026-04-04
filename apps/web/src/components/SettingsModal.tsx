import { useState } from "react";
import { X, HelpCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = "persona" | "account";

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("persona");
  const [soulContent, setSoulContent] = useState(
    "# Who You Are\n\nDescribe the personality and behavior you want your AI to have...\n\n## Examples\n\n- Be concise and direct\n- Focus on code quality\n- Explain reasoning when asked\n"
  );
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    // TODO: Call API to save SOUL.md
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsSaving(false);
    // TODO: Show toast notification
  };

  const tabs: { id: TabType; label: string }[] = [
    { id: "persona", label: "Persona" },
    { id: "account", label: "Account" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-medium text-zinc-950">Settings</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 transition-colors text-zinc-500"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-zinc-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? "bg-zinc-100 text-zinc-950"
                  : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "persona" && (
            <div className="space-y-4">
              {/* Header with help */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-zinc-950">SOUL.md</h3>
                  <button
                    title="Define your AI's personality and behavior. This will be used alongside the base system prompt."
                    className="w-5 h-5 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-600"
                  >
                    <HelpCircle className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Editor */}
              <div className="border border-zinc-200 rounded-xl overflow-hidden">
                <textarea
                  value={soulContent}
                  onChange={(e) => setSoulContent(e.target.value)}
                  placeholder="# Who You Are&#10;&#10;Describe the personality and behavior you want your AI to have..."
                  className="w-full h-80 p-4 text-sm font-mono text-zinc-800 bg-zinc-50 resize-none outline-none focus:bg-white transition-colors"
                />
              </div>

              {/* Info text */}
              <p className="text-xs text-zinc-400">
                This file defines your AI's personality. It will be combined with the base system prompt to shape how your AI responds.
              </p>
            </div>
          )}

          {activeTab === "account" && (
            <div className="space-y-6">
              {/* User info */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-cyan-400 flex items-center justify-center">
                  <span className="text-sm font-medium text-zinc-950">
                    {user?.displayName?.substring(0, 2).toUpperCase() ||
                      user?.email?.substring(0, 2).toUpperCase() ||
                      "U"}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-950">
                    {user?.displayName || "User"}
                  </p>
                  <p className="text-sm text-zinc-500">{user?.email}</p>
                </div>
              </div>

              {/* Logout button */}
              <button
                onClick={logout}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Log out
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === "persona" && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-zinc-950 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}