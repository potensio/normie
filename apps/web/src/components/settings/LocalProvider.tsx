/**
 * LocalProvider - Provider that doesn't require authentication
 */
import { useState } from 'react';
import { ChevronRight, CheckCircle, ExternalLink } from 'lucide-react';
import type { ProviderConfig } from '@/lib/providers-config';

interface LocalProviderProps {
  provider: ProviderConfig;
}

export function LocalProvider({ provider }: LocalProviderProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="group">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
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
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full">
                <CheckCircle className="w-3 h-3" />
                No key needed
              </span>
            </div>
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
          
          {/* Status indicator */}
          <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span className="text-xs text-emerald-700">
              This provider runs locally and doesn't require an API key
            </span>
          </div>
          
          {/* Docs link */}
          {provider.docsUrl && (
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 mt-3"
            >
              Learn more <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}