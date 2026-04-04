/**
 * API Client - Base fetch wrapper with auth and error handling
 * 
 * All API calls should go through this client for consistency.
 */

const BASE_URL = 'http://localhost:3001';

export interface ApiError {
  message: string;
  status?: number;
}

export class ApiClientError extends Error {
  status?: number;
  
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Make an authenticated API request
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers: customHeaders } = options;

  const headers: Record<string, string> = {
    ...customHeaders,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    credentials: 'include', // Include httpOnly cookies
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Handle session expiry
  if (response.status === 401) {
    throw new ApiClientError('Session expired', 401);
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      message = errorData.message || errorData.error || message;
    } catch {
      // Ignore JSON parse errors
    }
    throw new ApiClientError(message, response.status);
  }

  // Handle empty responses
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return {} as T;
  }

  return response.json();
}