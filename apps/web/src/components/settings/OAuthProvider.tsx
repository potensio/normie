/**
 * OAuthProvider - OAuth login flow for providers
 * 
 * Displays "Login with X" button and handles OAuth redirects.
 */
import { useState } from 'react';
import { ExternalLink, ChevronRight, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { ProviderConfig } from '@/lib/providers-config';

interface OAuthProviderProps {
  provider: ProviderConfig;
  configured: boolean;
  keyPreview?: string | null;
  onLogin: (provider: string) => Promise<void>;
  onLogout: (provider: string) => Promise<void>;
  isLoggingIn: boolean;
  isLoggingOut: boolean;
}

export function OAuthProvider({
  provider,
  configured,
  keyPreview,
  onLogin,
  onLogout,
  isLoggingIn,
  isLoggingOut,
}: OAuthProviderProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    try {
      await onLogin(provider.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleLogout = async () => {
    setError(null);
    try {
      await onLogout(provider.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const getOAuthLabel = () => {
    switch (provider.oauthProvider) {
      case 'github':
        return 'Login with GitHub';
      case 'google':
        return 'Login with Google';
      case 'anthropic':
        return 'Login with Anthropic';
      default:
        return 'Login';
    }
  };

  const getOAuthIcon = () => {
    switch (provider.oauthProvider) {
      case 'github':
        return '🐙';
      case 'google':
        return '🔵';
      case 'anthropic':
        return '🤖';
      default:
        return '🔑';
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
          <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-lg">
            {getOAuthIcon()}
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-900">{provider.name}</span>
              {configured ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-zinc-500 bg-zinc-100 rounded-full">
                  <AlertCircle className="w-3 h-3" />
                  Not connected
                </span>
              )}
            </div>
            {configured && keyPreview && (
              <span className="text-xs text-zinc-400 mt-0.5 block">
                {keyPreview}
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
          
          {/* OAuth button or connected state */}
          {configured ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-emerald-700">
                  Your account is connected
                </span>
              </div>
              
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
              >
                {isLoggingOut ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <span>{getOAuthIcon()}</span>
                    {getOAuthLabel()}
                  </>
                )}
              </button>
              
              {/* Docs link */}
              {provider.docsUrl && (
                <a
                  href={provider.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700"
                >
                  Learn more <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
          
          {/* Error message */}
          {error && (
            <p className="text-xs text-red-600 mt-2">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}