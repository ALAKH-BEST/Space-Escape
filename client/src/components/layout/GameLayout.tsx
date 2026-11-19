import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useLogout } from "@/hooks/use-auth";
import { useProgression } from "@/hooks/use-progression";
import { Button } from "@/components/ui/button";
import { Gem, Rocket, LogOut } from "lucide-react";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { MusicToggle } from "@/components/game/MusicToggle";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { isPortal } from "@/lib/portal";

const NAV_LINKS = [
  { href: "/game", label: "PLAY", portal: true },
  { href: "/hangar", label: "HANGAR", portal: true },
  { href: "/leaderboard", label: "LEADERBOARD", portal: false },
  { href: "/multiplayer", label: "MULTIPLAYER", portal: false },
];

export function GameLayout({ children }: { children: ReactNode }) {
  const { data: user } = useUser();
  const { data: progression } = useProgression();
  const { mutate: logout } = useLogout();
  const [location] = useLocation();

  return (
    // Portal builds fill the iframe exactly (no page scroll); the main area scrolls inside when a page is taller.
    <div className={isPortal ? "h-[100dvh] overflow-hidden flex flex-col bg-cover bg-center" : "desktop-fit-root min-h-screen flex flex-col bg-cover bg-center bg-fixed"}>
      {/* Dynamic Background Overlay */}
      <div className="fixed inset-0 bg-background/90 z-0 pointer-events-none" />

      {/* Navigation */}
      <nav className="relative z-10 border-b border-white/10 backdrop-blur-md bg-black/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={isPortal ? "flex items-center justify-between h-12 gap-2" : "flex items-center justify-between h-16 phone-landscape:h-12"}>
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-accent">
                <Rocket className="h-6 w-6 text-white" />
              </div>
              <span className={`text-base sm:text-xl font-display font-bold tracking-wider text-white ${isPortal ? "max-sm:hidden" : "max-[400px]:hidden"}`}>
                ASTRO<span className="text-primary">DODGE</span>
              </span>
            </div>

             {user && (
              <div className="flex items-center gap-2 sm:gap-4">
                <div className={`items-center gap-3 sm:gap-6 mr-2 sm:mr-4 ${isPortal ? "flex" : "hidden lg:flex phone-landscape:flex"}`}>
                  {NAV_LINKS.filter((link) => !isPortal || link.portal).map((link) => (
                    <Link key={link.href} href={link.href} className={`text-xs sm:text-sm font-medium transition-colors hover:text-primary ${location === link.href ? 'text-primary' : 'text-muted-foreground'}`}>
                      {link.label}
                    </Link>
                  ))}
                </div>

                <div className="flex items-center gap-2 sm:gap-3 sm:pl-4 sm:border-l border-white/10">
                  {location !== "/game" && <MusicToggle className="relative" popoverAlign="right" />}
                  <div className="max-lg:hidden phone-landscape:hidden"><ThemeSelector /></div>
                  <SettingsMenu />
                  <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-mono text-cyan-300" title="Gem balance">
                    <Gem className="h-4 w-4" />
                    {(progression?.gems ?? user?.gems ?? 0).toLocaleString()}
                  </div>
                  {!isPortal && (
                    <>
                      <span className="hidden lg:block text-sm font-mono text-muted-foreground">
                        CMDR. {user.username.toUpperCase()}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => logout()}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <LogOut className="h-5 w-5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        {user && !isPortal && (
          <div className="flex border-t border-white/10 lg:hidden phone-landscape:hidden" role="navigation" aria-label="Pages">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex min-h-11 flex-1 items-center justify-center border-b-2 px-1 text-[11px] font-medium tracking-wide transition-colors ${location === link.href ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className={isPortal ? "relative z-10 flex-1 min-h-0 overflow-y-auto container mx-auto px-2 py-2" : "relative z-10 flex-1 container mx-auto px-4 py-4 sm:py-8 phone-landscape:py-2"}>
        {children}
      </main>
      {!isPortal && <PublicFooter />}
    </div>
  );
}
