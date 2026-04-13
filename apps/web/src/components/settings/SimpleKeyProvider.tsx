/**
 * SimpleKeyProvider - Single API key input field
 */
import { useState } from 'react';
import { Eye, EyeOff, ExternalLink, ChevronRight, CheckCircle, AlertCircle } from 'lucide-react';
import type { ProviderConfig } from '@/lib/providers-config';

interface SimpleKeyProviderProps {
  provider: ProviderConfig;
  configured: boolean;
  keyPreview: string | null;
  onSave: (provider: string, apiKey: string | Record<string, any>) => Promise<void>;
  onDelete: (provider: string) => Promise<void>;
  isSaving: boolean;
  isDeleting: boolean;
}

export function SimpleKeyProvider({ 
  provider, 
  configured, 
  keyPreview,
  onSave, 
  onDelete,
  isSaving,
  isDeleting
}: SimpleKeyProviderProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    
    setError(null);
    try {
      await onSave(provider.id, apiKey);
      setApiKey(''); // Clear after successful save
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async () => {
    setError(null);
    try {
      await onDelete(provider.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    setError(null);
  };

  return (
    <div className="group">
      {/* Header - always visible */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {/* Provider icon placeholder */}
          <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
            <span className="text-xs font-bold text-zinc-500">
              {provider.name.substring(0, 2).toUpperCase()}
            </span>
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-900">{provider.name}</span>
              {configured ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-zinc-500 bg-zinc-100 rounded-full">
                  <AlertCircle className="w-3 h-3" />
                  Not set
                </span>
              )}
            </div>
            {configured && keyPreview && (
              <span className="text-xs text-zinc-400 mt-0.5 block">
                Key: {keyPreview}...
              </span>
            )}
          </div>
        </div>
        
        <ChevronRight 
          className={`w-4 h-4 text-zinc-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
        />
      </button>
      
      {/* Expandable content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-zinc-100">
          <p className="text-xs text-zinc-500 mb-3">{provider.description}</p>
          
          {/* API Key Input */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Enter your ${provider.name} API key`}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            
            {/* Get key link */}
            {provider.getKeyUrl && (
              <a
                href={provider.getKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700"
              >
                Get your API key <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          
          {/* Error message */}
          {error && (
            <p className="text-xs text-red-600 mt-2">{error}</p>
          )}
          
          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleSave}
              disabled={!apiKey.trim() || isSaving}
              className="px-3 py-1.5 text-xs font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            {configured && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isDeleting ? 'Removing...' : 'Remove'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}