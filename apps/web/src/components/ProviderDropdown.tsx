import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { Provider } from '@normie/types';
import { PROVIDER_LABELS } from '@/lib/constants';
import { useChat } from '@/contexts/ChatContext';

interface ProviderDropdownProps {
  variant?: 'home' | 'chat';
}

export function ProviderDropdown({ variant: _variant = 'home' }: ProviderDropdownProps) {
  const { selectedProvider, setProvider } = useChat();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (provider: Provider) => {
    setProvider(provider);
    setIsOpen(false);
  };

  const providers: Provider[] = ['claude', 'opencode', 'kimi', 'bedrock'];

  const getDescription = (provider: Provider) => {
    switch (provider) {
      case 'claude': return 'Claude Agent SDK';
      case 'opencode': return 'Opencode SDK';
      case 'kimi': return 'Kimi API';
      case 'bedrock': return 'AWS Bedrock';
      default: return '';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-cream rounded-lg transition-colors"
      >
        <span>{PROVIDER_LABELS[selectedProvider]}</span>
        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-44 bg-white border border-gray-200 rounded-xl shadow-dropdown p-2 z-50">
          {providers.map((provider) => (
            <button
              key={provider}
              onClick={() => handleSelect(provider)}
              className={`w-full flex flex-col items-start px-3 py-3 rounded-lg transition-colors text-left ${
                selectedProvider === provider 
                  ? 'bg-cream' 
                  : 'hover:bg-cream'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-sm font-medium text-gray-900">
                  {PROVIDER_LABELS[provider]}
                </span>
                {selectedProvider === provider && (
                  <Check size={18} className="text-coral" />
                )}
              </div>
              <span className="text-xs text-gray-400 mt-1">
                {getDescription(provider)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
