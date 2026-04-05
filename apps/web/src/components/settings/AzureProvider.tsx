/**
 * AzureProvider - Azure OpenAI credentials configuration
 * 
 * Requires:
 * - API Key
 * - Resource Name
 * - Deployment Name
 * - API Version
 */
import { useState } from 'react';
import { ChevronRight, CheckCircle, AlertCircle, Eye, EyeOff, ExternalLink } from 'lucide-react';
import type { ProviderConfig } from '@/lib/providers-config';

interface AzureCredentials {
  apiKey: string;
  resourceName: string;
  deploymentName: string;
  apiVersion: string;
}

interface AzureProviderProps {
  provider: ProviderConfig;
  configured: boolean;
  keyPreview?: string | null;
  onSave: (provider: string, credentials: AzureCredentials | string | Record<string, any>) => Promise<void>;
  onDelete: (provider: string) => Promise<void>;
  isSaving: boolean;
  isDeleting: boolean;
}

const API_VERSIONS = [
  { value: '2024-02-15-preview', label: '2024-02-15-preview' },
  { value: '2024-08-01-preview', label: '2024-08-01-preview' },
  { value: '2025-01-01-preview', label: '2025-01-01-preview (Latest)' },
];

export function AzureProvider({
  provider,
  configured,
  keyPreview,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: AzureProviderProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [resourceName, setResourceName] = useState('');
  const [deploymentName, setDeploymentName] = useState('');
  const [apiVersion, setApiVersion] = useState('2025-01-01-preview');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    
    if (!apiKey.trim() || !resourceName.trim() || !deploymentName.trim()) {
      setError('All fields are required');
      return;
    }
    
    try {
      await onSave(provider.id, { apiKey, resourceName, deploymentName, apiVersion });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      // Always clear sensitive field
      setApiKey('');
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

  return (
    <div className="group">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <span className="text-sm">🔷</span>
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-900">{provider.name}</span>
              {configured ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  Configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-zinc-500 bg-zinc-100 rounded-full">
                  <AlertCircle className="w-3 h-3" />
                  Not set
                </span>
              )}
            </div>
            {configured && keyPreview && (
              <span className="text-xs text-zinc-400 mt-0.5 block">{keyPreview}</span>
            )}
          </div>
        </div>
        
        <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
      </button>
      
      {/* Expandable content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-zinc-100">
          <p className="text-xs text-zinc-500 mb-3">{provider.description}</p>
          
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Azure API key"
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
            
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Resource Name</label>
              <input
                type="text"
                value={resourceName}
                onChange={(e) => setResourceName(e.target.value)}
                placeholder="my-openai-resource"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              />
              <p className="text-xs text-zinc-400 mt-1">
                Found in Azure Portal under your OpenAI resource
              </p>
            </div>
            
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Deployment Name</label>
              <input
                type="text"
                value={deploymentName}
                onChange={(e) => setDeploymentName(e.target.value)}
                placeholder="gpt-4"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              />
              <p className="text-xs text-zinc-400 mt-1">
                The name you gave your model deployment
              </p>
            </div>
            
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">API Version</label>
              <select
                value={apiVersion}
                onChange={(e) => setApiVersion(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 bg-white"
              >
                {API_VERSIONS.map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Error message */}
          {error && (
            <p className="text-xs text-red-600 mt-2">{error}</p>
          )}
          
          {/* Actions */}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-3 py-1.5 text-xs font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            {configured && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 transition-colors"
              >
                {isDeleting ? 'Removing...' : 'Remove'}
              </button>
            )}
          </div>
          
          {/* Docs link */}
          {provider.docsUrl && (
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 mt-3"
            >
              Azure OpenAI docs <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}