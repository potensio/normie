/**
 * BedrockProvider - AWS Bedrock credentials configuration
 * 
 * Supports two auth modes:
 * 1. AWS Profile - use a named profile from ~/.aws/credentials
 * 2. Access Keys - AWS Access Key ID + Secret Access Key + Region
 */
import { useState } from 'react';
import { ChevronRight, CheckCircle, AlertCircle, Eye, EyeOff, ExternalLink } from 'lucide-react';
import type { ProviderConfig } from '@/lib/providers-config';

type AuthMode = 'profile' | 'credentials';

interface BedrockCredentials {
  authMode: AuthMode;
  profile?: string;
  accessKey?: string;
  secretKey?: string;
  region?: string;
}

interface BedrockProviderProps {
  provider: ProviderConfig;
  configured: boolean;
  keyPreview?: string | null;
  onSave: (provider: string, credentials: BedrockCredentials | string | Record<string, any>) => Promise<void>;
  onDelete: (provider: string) => Promise<void>;
  isSaving: boolean;
  isDeleting: boolean;
}

const AWS_REGIONS = [
  // US East
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  // US West
  { value: 'us-west-2', label: 'US West (Oregon)' },
  // Europe
  { value: 'eu-west-1', label: 'EU (Ireland)' },
  { value: 'eu-west-2', label: 'EU (London)' },
  { value: 'eu-west-3', label: 'EU (Paris)' },
  { value: 'eu-central-1', label: 'EU (Frankfurt)' },
  { value: 'eu-central-2', label: 'EU (Zurich)' },
  { value: 'eu-south-1', label: 'EU (Spain)' },
  { value: 'eu-north-1', label: 'EU (Stockholm)' },
  // Asia Pacific
  { value: 'ap-east-1', label: 'Asia Pacific (Hong Kong)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { value: 'ap-northeast-3', label: 'Asia Pacific (Osaka)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { value: 'ap-southeast-3', label: 'Asia Pacific (Jakarta)' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
  { value: 'ap-south-2', label: 'Asia Pacific (Hyderabad)' },
  // Canada
  { value: 'ca-central-1', label: 'Canada (Central)' },
  // South America
  { value: 'sa-east-1', label: 'South America (São Paulo)' },
  // Middle East
  { value: 'me-south-1', label: 'Middle East (Bahrain)' },
  { value: 'me-central-1', label: 'Middle East (UAE)' },
  // Africa
  { value: 'af-south-1', label: 'Africa (Cape Town)' },
];

export function BedrockProvider({
  provider,
  configured,
  keyPreview,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: BedrockProviderProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('credentials');
  const [profile, setProfile] = useState('default');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    
    const credentials: BedrockCredentials = authMode === 'profile'
      ? { authMode, profile }
      : { authMode, accessKey, secretKey, region };
    
    // Validate
    if (authMode === 'profile' && !profile.trim()) {
      setError('Profile name is required');
      return;
    }
    if (authMode === 'credentials') {
      if (!accessKey.trim() || !secretKey.trim()) {
        setError('Access Key and Secret Key are required');
        return;
      }
    }
    
    try {
      await onSave(provider.id, credentials);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      // Always clear sensitive fields
      setAccessKey('');
      setSecretKey('');
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
          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
            <span className="text-sm">🪨</span>
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
          
          {/* Auth mode toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setAuthMode('profile')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                authMode === 'profile' 
                  ? 'bg-zinc-900 text-white' 
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              AWS Profile
            </button>
            <button
              onClick={() => setAuthMode('credentials')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                authMode === 'credentials' 
                  ? 'bg-zinc-900 text-white' 
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Access Keys
            </button>
          </div>
          
          {/* Fields based on auth mode */}
          {authMode === 'profile' ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Profile Name</label>
                <input
                  type="text"
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                  placeholder="default"
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
                <p className="text-xs text-zinc-400 mt-1">
                  Uses profile from ~/.aws/credentials
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Access Key ID</label>
                <input
                  type="text"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  placeholder="AKIA..."
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-mono"
                />
              </div>
              
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Secret Access Key</label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder="Enter your secret key"
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Region</label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 bg-white"
                >
                  {AWS_REGIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          
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
              AWS Bedrock docs <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}