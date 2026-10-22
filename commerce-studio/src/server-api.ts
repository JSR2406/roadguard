import { useCallback, useEffect, useMemo } from 'react';
import type { WorkspaceProfile } from './types';

export interface Session {
  token: string;
  user: { id: string; email: string };
  workspace: { id: string; name: string; role: string };
  profile: WorkspaceProfile;
}

export interface AuthResponse extends Omit<Session, 'token'> {
  sessionToken: string;
  sessionExpiresAt: string;
}

export function sessionFromResponse(response: AuthResponse): Session {
  if (!response.sessionToken) throw new Error('The API did not return a session token. Please sign in again.');
  return { token: response.sessionToken, user: response.user, workspace: response.workspace, profile: response.profile };
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

const unavailableMessage = 'Cannot reach the local API. Start it with npm run server in commerce-studio, then try again. If a save was interrupted, refresh the list before submitting again.';

export async function serverApi<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    response = await fetch(path, { ...options, headers, cache: 'no-store' });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(unavailableMessage, 0);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(response.status === 401 ? 'Your session is no longer valid. Please sign in again.' : unavailableMessage, response.status);
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body
      && typeof body.error === 'object' && body.error !== null && 'message' in body.error
      && typeof body.error.message === 'string' ? body.error.message : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export function requestErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

/** A ticket remains valid only for the mounted view and session that started it. */
export function useRequestScope(identity?: string) {
  const scope = useMemo(() => ({ active: false, controller: new AbortController() }), [identity]);
  useEffect(() => {
    scope.active = true;
    scope.controller = new AbortController();
    return () => { scope.active = false; scope.controller.abort(); };
  }, [scope]);
  const begin = useCallback(() => {
    const controller = scope.controller;
    return { signal: controller.signal, isCurrent: () => scope.active && !controller.signal.aborted };
  }, [scope]);
  const invalidate = useCallback(() => {
    scope.active = false;
    scope.controller.abort();
  }, [scope]);
  return { begin, invalidate };
}
