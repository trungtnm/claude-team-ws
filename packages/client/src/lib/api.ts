import { toCamelCase, toSnakeCase } from './case-convert'
import { ApiError } from './api-error'

const BASE_URL = '/api'

// Prevent multiple 401 redirects from parallel requests
let redirecting = false

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: extraHeaders, ...rest } = options

  const headers: Record<string, string> = {
    ...(extraHeaders as Record<string, string>),
  }

  // Only set Content-Type when there is a body (avoids unnecessary CORS preflights)
  if (body) {
    headers['Content-Type'] = 'application/json'
  }

  // Auth token injection from localStorage (API key)
  // JWT auth uses HttpOnly cookie — browser sends automatically
  const token = localStorage.getItem('auth_token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers,
    credentials: 'include', // Send cookies (ctw_session JWT)
    body: body ? JSON.stringify(toSnakeCase(body)) : undefined,
  })

  if (!response.ok) {
    // Global 401 handler — clear auth and redirect to login (deduped for parallel requests)
    if (response.status === 401 && !path.startsWith('/auth/') && !redirecting) {
      redirecting = true
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
      // Return a never-resolving promise to prevent error toasts during navigation
      return new Promise<T>(() => {})
    }
    if (redirecting) {
      return new Promise<T>(() => {})
    }

    const errorBody = await response.json().catch(() => ({
      error: response.statusText,
    }))

    throw new ApiError(
      response.status,
      errorBody.error ?? `HTTP ${response.status}`,
      errorBody.issues, // zod validation issues from server
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  const json = await response.json()
  return toCamelCase<T>(json)
}

// Convenience methods
export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T = void>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body }),
}
