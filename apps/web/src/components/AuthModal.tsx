import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthMutations } from '@/hooks';

export function AuthModal() {
  const { isLoading, error, clearError } = useAuth();
  const { login, register, isLoggingIn, isRegistering } = useAuthMutations();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (isRegisterMode) {
      register.mutate({ email, password, displayName });
    } else {
      login.mutate({ email, password });
    }
  };

  const toggleMode = () => {
    setIsRegisterMode(!isRegisterMode);
    clearError();
  };

  const isSubmitting = isLoggingIn || isRegistering || isLoading;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl m-4">
        <div className="px-6 pt-6">
          <h2 className="text-xl font-semibold text-gray-900">
            {isRegisterMode ? 'Register' : 'Login'}
          </h2>
        </div>
        
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegisterMode && (
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-gray-600 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-coral transition-colors"
                />
              </div>
            )}
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-600 mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-coral transition-colors"
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                minLength={8}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-coral transition-colors"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full py-3 bg-coral hover:bg-coral-dark disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors mt-2"
            >
              {isRegisterMode ? 'Create Account' : 'Login'}
            </button>
          </form>
          
          <p className="mt-4 text-center text-sm text-gray-600">
            {isRegisterMode ? "Already have an account?" : "Don't have an account?"}
            <button
              type="button"
              onClick={toggleMode}
              className="ml-1 text-coral hover:text-coral-dark font-medium underline"
            >
              {isRegisterMode ? 'Login' : 'Register'}
            </button>
          </p>
          
          {error && (
            <p className="mt-4 p-3 bg-red-50 text-red-500 rounded-md text-sm text-center">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
