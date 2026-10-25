import { useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { startMusic, stopMusic } from "@/lib/background-music";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUser } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import AuthPage from "@/pages/AuthPage";
import GamePage from "@/pages/GamePage";
import LeaderboardPage from "@/pages/LeaderboardPage";
import HangarPage from "@/pages/HangarPage";
import AboutPage from "@/pages/AboutPage";
import PrivacyPage from "@/pages/PrivacyPage";
import TermsPage from "@/pages/TermsPage";
import NotFound from "@/pages/not-found";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import MultiplayerPage from "@/pages/MultiplayerPage";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-primary">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={AuthPage} />
      <Route path="/game">
        <ProtectedRoute component={GamePage} />
      </Route>
      <Route path="/leaderboard">
        <ProtectedRoute component={LeaderboardPage} />
      </Route>
      <Route path="/hangar">
        <ProtectedRoute component={HangarPage} />
      </Route>
      <Route path="/multiplayer">
        <ProtectedRoute component={MultiplayerPage} />
      </Route>
      <Route path="/about" component={AboutPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

// The soundtrack plays on every page that has a mute button (everything except
// the login screen), so it keeps looping as you move between pages.
const MUSIC_ROUTES = ["/game", "/hangar", "/leaderboard", "/multiplayer", "/about", "/privacy", "/terms"];

function AppMusic() {
  const [location] = useLocation();
  const shouldPlay = MUSIC_ROUTES.includes(location);

  useEffect(() => {
    if (shouldPlay) startMusic();
    else stopMusic();
  }, [shouldPlay]);

  useEffect(() => () => stopMusic(0.4), []);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <GoogleAnalytics />
          <AppMusic />
          <Router />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
