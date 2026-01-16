import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type InsertScore } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useScores() {
  return useQuery({
    queryKey: ["/api/scores"],
    queryFn: async () => {
      const res = await fetch(api.scores.list.path);
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
    mutationFn: async (data: InsertScore) => {
      const res = await fetch(api.scores.create.path, {
        method: api.scores.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error("Failed to submit score");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
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
