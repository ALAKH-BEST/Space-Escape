import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/apiBase";

export function useScores() {
  return useQuery({
    queryKey: ["/api/scores"],
    queryFn: async () => {
      const res = await fetch(apiUrl(api.scores.list.path), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      const data = await res.json();
      return api.scores.list.responses[200].parse(data);
    },
  });
}

export function useSubmitScore() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { runId: string; runToken: string }) => {
      const res = await fetch(apiUrl(api.scores.create.path), {
        method: api.scores.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to submit score");
      return api.scores.create.responses[201].parse(await res.json());
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
      queryClient.setQueryData([api.progression.get.path], (progression) =>
        progression
          ? { ...progression, gems: result.totalGems }
          : progression,
      );
      queryClient.invalidateQueries({ queryKey: [api.progression.get.path] });
      queryClient.setQueryData(["/api/user"], (user: any) =>
        user ? { ...user, gems: result.totalGems } : user,
      );
      toast({
        title: "Score Uploaded",
        description: "Your achievement has been recorded in the galactic archives.",
      });
    },
    onError: () => {
      toast({
        title: "Transmission Failed",
        description: "Could not upload score to mainframe.",
        variant: "destructive",
      });
    },
  });
}

export function useStartRun() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (mode: "solo" | "multiplayer") => {
      const res = await fetch(apiUrl(api.runs.start.path), {
        method: api.runs.start.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, heartbeat: true }),
        credentials: "include",
      });
      if (!res.ok) {
        let message = `Mission authorization failed (${res.status})`;
        try {
          const data = await res.json();
          if (typeof data?.message === "string" && data.message.trim()) message = data.message;
        } catch {
          // Keep the status-based message when the server response is not JSON.
        }
        throw new Error(message);
      }
      return api.runs.start.responses[201].parse(await res.json());
    },
    onError: (error: Error) => {
      toast({
        title: "MISSION LAUNCH FAILED",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Lets the server know a run is still being played and returns the refreshed
 * run token. Best-effort: any failure resolves to null and never affects play.
 */
export async function sendRunHeartbeat(runId: string, runToken: string): Promise<string | null> {
  const controller = new AbortController();
  // A hung request must not block the next heartbeat.
  const timeout = window.setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(apiUrl(api.runs.heartbeat.path), {
      method: api.runs.heartbeat.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, runToken }),
      credentials: "include",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return api.runs.heartbeat.responses[200].parse(await res.json()).runToken;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export type ScoreResult = ReturnType<typeof api.scores.create.responses[201]["parse"]>;
