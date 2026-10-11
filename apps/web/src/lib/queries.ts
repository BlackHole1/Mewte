import type { Status } from "@mewte/shared";
import { QueryCache, QueryClient, useQuery } from "@tanstack/react-query";
import { ApiRequestError, api } from "./api";

export const keys = {
  status: ["status"] as const,
  accounts: ["accounts"] as const,
  rules: ["rules"] as const,
  rulesSource: ["rules-source"] as const,
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

/** How often the rules page looks for edits made in the rules file. */
const RULES_FILE_POLL_MS = 5000;

export const useRulesSource = () =>
  useQuery({
    queryKey: keys.rulesSource,
    queryFn: api.rulesSource,
    refetchInterval: (query) => (query.state.data?.enabled ? RULES_FILE_POLL_MS : false),
  });

/** With `poll`, picks up rules that were changed in the rules file while the page is open. */
export const useRules = (options: { poll?: boolean } = {}) =>
  useQuery({
    queryKey: keys.rules,
    queryFn: api.rules,
    refetchInterval: options.poll ? RULES_FILE_POLL_MS : false,
  });
