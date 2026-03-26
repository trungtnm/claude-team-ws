import { toCamelCase, toSnakeCase } from './case-convert'
import { ApiError } from './api-error'

const BASE_URL = '/api'

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
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T = void>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body }),
}
