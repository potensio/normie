import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Plus, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function WorkspaceDropdown() {
  const { currentWorkspace, workspaces, switchWorkspace, createWorkspace } = useAuth();
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
    
    // Switch workspace - ChatContext's useEffect will handle refreshing chats
    switchWorkspace(workspaceId);
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
      const workspace = await createWorkspace(name);
      // Switch to the new workspace - ChatContext's useEffect will handle refreshing chats
      switchWorkspace(workspace.id);
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
          <span className="text-xs font-medium text-zinc-950">
            {getWorkspaceInitials()}
          </span>
        </div>
        <div className="flex flex-col flex-1 min-w-0 text-left">
          <span className="text-sm font-medium text-zinc-950 truncate tracking-tight">
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
                className="w-full text-sm bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-coral/20 focus:border-coral transition-all"
                autoFocus
              />
              {error && (
                <p className="text-xs text-red-500 mt-1.5">{error}</p>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleCancelCreate}
                  disabled={isSubmitting}
                  className="flex-1 text-xs text-zinc-600 hover:text-zinc-900 py-1.5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateWorkspace}
                  disabled={isSubmitting || !newWorkspaceName.trim()}
                  className="flex-1 bg-zinc-900 text-white text-xs py-1.5 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
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
                    <span className="text-sm text-zinc-900 truncate flex-1">
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
                    <span className="text-sm text-zinc-600">New workspace</span>
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