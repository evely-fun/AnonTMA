import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { CallOverlay } from "@/features/friends/CallOverlay";
import { ChatPage } from "@/pages/ChatPage";
import { FriendsPage } from "@/pages/FriendsPage";
import { GamePage } from "@/pages/GamePage";
import { GamesPage } from "@/pages/GamesPage";
import { HomePage } from "@/pages/HomePage";
import { LeaderboardPage } from "@/pages/LeaderboardPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { RoomPage } from "@/pages/RoomPage";
import { RoomsPage } from "@/pages/RoomsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { authenticate } from "@/shared/lib/api";
import { realtime } from "@/shared/lib/socket";
import { Toaster } from "@/shared/ui";
import { useSession } from "@/store/session";

import { BottomNav } from "./BottomNav";
import { bindRealtime } from "./bridge";
import styles from "./App.module.css";

const TAB_ROUTES = ["/", "/rooms", "/games", "/friends", "/profile"];

const Boot = () => (
  <div className={styles.boot}>
    <div className={styles.bootOrb} />
    <p className={styles.bootText}>Preparing your mask…</p>
  </div>
);

export const App = () => {
  const location = useLocation();
  const loading = useSession((state) => state.loading);
  const profile = useSession((state) => state.profile);
  const load = useSession((state) => state.load);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async (): Promise<void> => {
      await authenticate();
      if (cancelled) {
        return;
      }
      bindRealtime();
      await load();
      realtime.connect();
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    const preference = profile?.preferences?.theme;
    if (preference === "light" || preference === "dark") {
      document.documentElement.dataset.theme = preference;
    } else {
      delete document.documentElement.dataset.theme;
    }
  }, [profile?.preferences?.theme]);

  const showNav = TAB_ROUTES.includes(location.pathname);
  const onboarded = profile ? (profile.interests?.length ?? 0) > 0 || profile.stats.dialogsTotal > 0 : true;

  if (loading && !profile) {
    return <Boot />;
  }

  return (
    <div className={styles.shell}>
      <div className={styles.aurora} aria-hidden="true" />
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={onboarded ? <HomePage /> : <OnboardingPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/rooms/:roomId" element={<RoomPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/games/:gameKey" element={<GamePage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </AnimatePresence>
      {showNav ? <BottomNav /> : null}
      <CallOverlay />
      <Toaster />
    </div>
  );
};
