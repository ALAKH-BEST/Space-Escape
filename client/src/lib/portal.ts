// Portal builds (CrazyGames, Poki) run the game on its own: no accounts, no server
// and no ads of our own. The target is fixed at build time by `--mode` in
// vite.config.portal.ts, so a normal build contains none of the portal behaviour.

export type PortalTarget = "crazygames" | "poki";

const mode = import.meta.env.VITE_PORTAL;

export const portalTarget: PortalTarget | null = mode === "crazygames" || mode === "poki" ? mode : null;
export const isPortal = portalTarget !== null;
