import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/services/api-client';
import { ToastProvider } from '@/components/Toast';
import { AuthProvider } from './AuthProvider';

/**
 * TanStack Query is the only cache for server data.
 *
 * Retrying a 4xx is pointless and, on a financial write, actively unhelpful — so
 * client errors are never retried.
 */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });

interface AppProvidersProps {
  children: ReactNode;
  /** Tests inject a client with retries disabled. */
  queryClient?: QueryClient;
}

export const AppProviders = ({ children, queryClient }: AppProvidersProps) => {
  const [client] = useState(() => queryClient ?? createQueryClient());

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
};
