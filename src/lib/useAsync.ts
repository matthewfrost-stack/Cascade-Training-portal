/**
 * Custom hook for managing async operations with abort signal support
 * Handles cleanup and prevents state updates after component unmount
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseAsyncOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  onAbort?: () => void;
}

interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useAsync<T>(
  asyncFn: (signal: AbortSignal) => Promise<T>,
  options: UseAsyncOptions<T> = {}
): UseAsyncState<T> {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const execute = useCallback(async () => {
    // Cancel previous request
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {
        // Ignore abort errors
      }
    }

    // Create new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      if (!isMountedRef.current) return;

      setState({ data: null, loading: true, error: null });

      const result = await asyncFn(abortController.signal);

      if (isMountedRef.current && !abortController.signal.aborted) {
        setState({ data: result, loading: false, error: null });
        options.onSuccess?.(result);
      }
    } catch (error) {
      // Ignore abort errors - they're expected when navigating
      if (error instanceof Error && error.name === 'AbortError') {
        options.onAbort?.();
        return;
      }

      if (isMountedRef.current) {
        const err = error instanceof Error ? error : new Error(String(error));
        setState({ data: null, loading: false, error: err });
        options.onError?.(err);
      }
    }
  }, [asyncFn, options]);

  useEffect(() => {
    isMountedRef.current = true;
    execute();

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
      } catch {
          // Ignore abort errors
        }
      }
    };
  }, [execute]);

  return state;
}

/**
 * Hook for managing fetch requests with cleanup
 */
export function useFetch<T>(
  url: string | null,
  options?: RequestInit
) {
  return useAsync<T>(
    async (signal) => {
      if (!url) throw new Error('URL is required');
      const response = await fetch(url, { ...options, signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    {}
  );
}
