'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

import { isSrsBusyError } from '@/lib/srs-busy-error';

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 10 * 60 * 1000, // 10 minutes
            // Una vez, salvo «sistema ocupado» (503 DB_POOL_BUSY): reintentar sólo
            // duplica la espera antes de mostrar el mensaje.
            retry: (failureCount, error) => !isSrsBusyError(error) && failureCount < 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            // Never auto-retry: mutations here send emails, delete statements and
            // apply discounts. A retry after a failure that already reached the
            // server duplicates the side effect (two emails for one click).
            retry: 0,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

