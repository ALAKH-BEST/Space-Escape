import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { InsertScore } from "@shared/schema";
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
    mutationFn: async (data: InsertScore & { runId: string }) => {
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

export type ScoreResult = ReturnType<typeof api.scores.create.responses[201]["parse"]>;
