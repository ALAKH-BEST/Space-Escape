import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { apiUrl } from "@/lib/apiBase";
import { isPortal } from "@/lib/portal";

/** Today's challenge: the day, its seed and how long is left. */
export function useDaily() {
  return useQuery({
    queryKey: [api.daily.today.path],
    // Portal builds have no server, so no daily board.
    enabled: !isPortal,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await fetch(apiUrl(api.daily.today.path), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch the daily challenge");
      return api.daily.today.responses[200].parse(await res.json());
    },
  });
}

/** "5h 12m", "42m" or "less than a minute" until the given time. */
export function formatTimeLeft(endsAt: number, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((endsAt - now) / 60_000));
  if (minutes < 1) return "less than a minute";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}
