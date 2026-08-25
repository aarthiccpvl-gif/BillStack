import { useQuery } from '@tanstack/react-query';
import type { HealthPayload } from '@app/shared';
import { apiClient } from '@/services/api-client';

export const healthKeys = {
  all: ['health'] as const,
};

/**
 * Polls the API's liveness endpoint. Its only job in Phase 1 is to prove, from
 * the browser, that the whole request path works: React → Vite proxy → Express →
 * envelope → typed payload.
 */
export const useHealth = () =>
  useQuery({
    queryKey: healthKeys.all,
    queryFn: () => apiClient.get<HealthPayload>('/health'),
    refetchInterval: 30_000,
    /* No retry: if the API is down the indicator should say so immediately, and
       the next poll is only 30 seconds away. */
    retry: false,
    staleTime: 10_000,
  });
