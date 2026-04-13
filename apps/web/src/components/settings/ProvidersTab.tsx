/**
 * ProvidersTab - Main container for provider API key settings
 * 
 * Displays providers organized into collapsible sections:
 * - Simple API Keys (Anthropic, OpenAI, Google, etc.)
 * - OAuth Providers (GitHub Copilot, Google Cloud Code)
 * - Cloud Providers (Bedrock, Azure, Vertex)
 * - Local Providers (Ollama)
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SimpleKeyProvider } from './SimpleKeyProvider';
import { OAuthProvider } from './OAuthProvider';
import { BedrockProvider } from './BedrockProvider';
import { AzureProvider } from './AzureProvider';
import { LocalProvider } from './LocalProvider';
import { 
  SIMPLE_KEY_PROVIDERS, 
  OAUTH_PROVIDERS,
  CLOUD_PROVIDERS, 
  LOCAL_PROVIDERS,
  type ProviderConfig 
} from '@/lib/providers-config';
import { useApiKeys, useSaveApiKey, useDeleteApiKey, type ApiKeyInfo } from '@/hooks/useApiKeys';

interface ProviderSectionProps {
  title: string;
  providers: ProviderConfig[];
  keys: ApiKeyInfo[] | undefined;
  defaultFolded?: boolean;
  onSave: (provider: string, apiKey: string | Record<string, any>) => Promise<void>;
  onDelete: (provider: string) => Promise<void>;
  isSaving: boolean;
  deletingProvider: string | null;
}

function ProviderSection({ 
  title, 
  providers, 
  keys, 
  defaultFolded = false,
  onSave,
  onDelete,
  isSaving,
  deletingProvider 
}: ProviderSectionProps) {
  const [isExpanded, setIsExpanded] = useState(!defaultFolded);

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-50 hover:bg-zinc-100 transition-colors"
      >
        <span className="text-sm font-medium text-zinc-900">{title}</span>
        <ChevronDown 
          className={`w-4 h-4 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
        />
      </button>
      
      {isExpanded && (
        <div className="divide-y divide-zinc-100">
          {providers.map(provider => {
            const keyInfo = keys?.find(k => k.provider === provider.id);
            
            // Render based on auth type
            switch (provider.authType) {
              case 'simple':
                return (
                  <SimpleKeyProvider
                    key={provider.id}
                    provider={provider}
                    configured={!!keyInfo}
                    keyPreview={keyInfo?.keyPreview || null}
                    onSave={onSave}
                    onDelete={onDelete}
                    isSaving={isSaving}
                    isDeleting={deletingProvider === provider.id}
                  />
                );
                
              case 'oauth':
                return (
                  <OAuthProvider
                    key={provider.id}
                    provider={provider}
                    configured={!!keyInfo}
                    keyPreview={keyInfo?.keyPreview || null}
                    onLogin={async () => {
                      // OAuth login - for now show message that it needs server implementation
                      throw new Error('OAuth requires server-side implementation. Please use API keys for now, or check documentation for OAuth setup.');
                    }}
                    onLogout={onDelete}
                    isLoggingIn={false}
                    isLoggingOut={deletingProvider === provider.id}
                  />
                );
                
              case 'bedrock':
                return (
                  <BedrockProvider
                    key={provider.id}
                    provider={provider}
                    configured={!!keyInfo}
                    keyPreview={keyInfo?.keyPreview || null}
                    onSave={onSave}
                    onDelete={onDelete}
                    isSaving={isSaving}
                    isDeleting={deletingProvider === provider.id}
                  />
                );
                
              case 'azure':
                return (
                  <AzureProvider
                    key={provider.id}
                    provider={provider}
                    configured={!!keyInfo}
                    keyPreview={keyInfo?.keyPreview || null}
                    onSave={onSave}
                    onDelete={onDelete}
                    isSaving={isSaving}
                    isDeleting={deletingProvider === provider.id}
                  />
                );
                
              case 'local':
                return (
                  <LocalProvider
                    key={provider.id}
                    provider={provider}
                  />
                );
                
              default:
                return null;
            }
          })}
        </div>
      )}
    </div>
  );
}

export function ProvidersTab() {
  const { data: keys, isLoading } = useApiKeys();
  const saveMutation = useSaveApiKey();
  const deleteMutation = useDeleteApiKey();
  
  const handleSave = async (provider: string, apiKey: string | Record<string, any>) => {
    await saveMutation.mutateAsync({ provider, apiKey });
  };
  
  const handleDelete = async (provider: string) => {
    await deleteMutation.mutateAsync(provider);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-zinc-300 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Description */}
      <p className="text-sm text-zinc-500">
        Configure API keys for AI providers. Your keys are encrypted and stored securely.
      </p>
      
      {/* Simple API Keys */}
      <ProviderSection
        title="API Keys"
        providers={SIMPLE_KEY_PROVIDERS}
        keys={keys}
        onSave={handleSave}
        onDelete={handleDelete}
        isSaving={saveMutation.isPending}
        deletingProvider={deleteMutation.variables || null}
      />
      
      {/* OAuth Providers */}
      {OAUTH_PROVIDERS.length > 0 && (
        <ProviderSection
          title="OAuth Providers"
          providers={OAUTH_PROVIDERS}
          keys={keys}
          defaultFolded={true}
          onSave={handleSave}
          onDelete={handleDelete}
          isSaving={saveMutation.isPending}
          deletingProvider={deleteMutation.variables || null}
        />
      )}
      
      {/* Cloud Providers */}
      <ProviderSection
        title="Cloud Providers"
        providers={CLOUD_PROVIDERS}
        keys={keys}
        defaultFolded={true}
        onSave={handleSave}
        onDelete={handleDelete}
        isSaving={saveMutation.isPending}
        deletingProvider={deleteMutation.variables || null}
      />
      
      {/* Local Providers */}
      <ProviderSection
        title="Local"
        providers={LOCAL_PROVIDERS}
        keys={keys}
        defaultFolded={true}
        onSave={handleSave}
        onDelete={handleDelete}
        isSaving={saveMutation.isPending}
        deletingProvider={deleteMutation.variables || null}
      />
    </div>
  );
}