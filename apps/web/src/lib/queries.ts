import type { Status } from "@mewte/shared";
import { QueryCache, QueryClient, useQuery } from "@tanstack/react-query";
import { ApiRequestError, api } from "./api";

export const keys = {
  status: ["status"] as const,
  accounts: ["accounts"] as const,
  rules: ["rules"] as const,
  rule: (id: string) => ["rules", id] as const,
  history: ["history"] as const,
  runs: ["runs"] as const,
  settings: ["settings"] as const,
  dashboard: ["dashboard"] as const,
  totp: ["totp"] as const,
};

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError(error) {
      // The session ended somewhere else. Dropping the user sends the app to the login page.
      if (error instanceof ApiRequestError && error.status === 401) {
        if (queryClient.getQueryData(keys.status)) {
          queryClient.setQueryData<Status>(keys.status, (status) =>
            status ? { ...status, user: null } : status,
          );
        } else {
          void queryClient.invalidateQueries({ queryKey: keys.status });
        }
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      retry: (failures, error) =>
        failures < 2 &&
        !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500),
    },
  },
});

export const useStatus = () =>
  useQuery({ queryKey: keys.status, queryFn: api.status, staleTime: 60_000 });

export const useAccounts = (options: { poll?: boolean } = {}) =>
  useQuery({
    queryKey: keys.accounts,
    queryFn: api.accounts,
    refetchInterval: options.poll ? 15_000 : false,
  });

export const useRules = () => useQuery({ queryKey: keys.rules, queryFn: api.rules });
