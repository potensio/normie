import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useChat } from '@/contexts/ChatContext';
import { PROVIDER_MODELS } from '@/lib/constants';

interface ModelDropdownProps {
  variant?: 'home' | 'chat';
}

export function ModelDropdown({ variant: _variant = 'home' }: ModelDropdownProps) {
  const { selectedProvider, selectedModel, setModel } = useChat();
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

  const handleSelect = (modelValue: string) => {
    setModel(modelValue);
    setIsOpen(false);
  };

  const models = PROVIDER_MODELS[selectedProvider] || PROVIDER_MODELS.claude;
  const selectedModelInfo = models.find(m => m.value === selectedModel);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-cream rounded-lg transition-colors"
      >
        <span>{selectedModelInfo?.label || 'Select Model'}</span>
        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-64 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-dropdown p-2 z-50">
          {models.map((model) => (
            <button
              key={model.value}
              onClick={() => handleSelect(model.value)}
              className={`w-full flex flex-col items-start px-3 py-3 rounded-lg transition-colors text-left ${
                selectedModel === model.value 
                  ? 'bg-cream' 
                  : 'hover:bg-cream'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-sm font-medium text-gray-900">
                  {model.label}
                </span>
                {selectedModel === model.value && (
                  <Check size={18} className="text-coral" />
                )}
              </div>
              <span className="text-xs text-gray-400 mt-1">
                {model.desc}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
