import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { api, isDemoMode, mockClient } from "./api";
import type { CandidateQuery } from "./types";

// In demo mode the mock client drives an async state machine; re-fetch on its updates
// the same way a real backend would push events.
export function useDemoSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isDemoMode) return;
    const unsubscribe = mockClient.subscribe(() => {
      void queryClient.invalidateQueries();
    });
    return () => {
      unsubscribe();
    };
  }, [queryClient]);
}

export function useExperiments() {
  return useQuery({ queryKey: ["experiments"], queryFn: () => api.listExperiments() });
}

export function useExperiment(id: string) {
  return useQuery({ queryKey: ["experiment", id], queryFn: () => api.getExperiment(id) });
}

export function useExperimentEvents(id: string) {
  return useQuery({ queryKey: ["events", id], queryFn: () => api.getExperimentEvents(id) });
}

export function useCandidates(query: CandidateQuery = {}) {
  return useQuery({
    queryKey: ["candidates", query],
    queryFn: () => api.getCandidates(query),
  });
}

export function useArtifacts(experimentId: string) {
  return useQuery({
    queryKey: ["artifacts", experimentId],
    queryFn: () => api.getArtifacts(experimentId),
  });
}
