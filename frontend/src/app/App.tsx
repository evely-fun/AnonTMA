import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { authenticate, type AuthOutcome } from "@/shared/lib/api";
import { realtime } from "@/shared/lib/socket";
import { Toaster } from "@/shared/ui";
import { useSession } from "@/store/session";

import { BottomNav } from "./BottomNav";
import { bindRealtime } from "./bridge";
import styles from "./App.module.css";

const TAB_ROUTES = ["/", "/rooms", "/games", "/friends", "/profile"];

const Boot = ({ hint }: { hint: string }) => (
  <div className={styles.boot}>
    <div className={styles.bootOrb} />
    <p className={styles.bootText}>{hint}</p>
  </div>
);

const Failure = ({
  message,
  detail,
  onRetry,
}: {
  message: string;
  detail?: string;
  onRetry: () => void;
}) => (
  <div className={styles.boot}>
    <div className={styles.bootIcon}>🛰</div>
    <p className={styles.bootText}>{message}</p>
    {detail ? <p className={styles.bootDetail}>{detail}</p> : null}
    <button type="button" className={styles.bootRetry} onClick={onRetry}>
      Try again
    </button>
  </div>
);

const FAILURE_TEXT: Record<string, string> = {
  "no-telegram": "Open this app from the Telegram bot, it needs a Telegram session to sign you in.",
  rejected: "Telegram would not confirm this session. Close the app and open it again from the bot.",
  unreachable: "Cannot reach the server right now.",
};

export const App = () => {
  const location = useLocation();
  const loading = useSession((state) => state.loading);
  const profile = useSession((state) => state.profile);
  const load = useSession((state) => state.load);
  const [auth, setAuth] = useState<AuthOutcome | null>(null);
  const [waking, setWaking] = useState(false);
  const running = useRef(false);

  const bootstrap = useCallback(async (): Promise<void> => {
    if (running.current) {
      return;
    }
    running.current = true;
    setAuth(null);
    const slow = window.setTimeout(() => setWaking(true), 4000);
    try {
      const outcome = await authenticate();
      setAuth(outcome);
      if (outcome.status !== "ok") {
        return;
      }
      bindRealtime();
      await load();
      realtime.connect();
    } finally {
      window.clearTimeout(slow);
      setWaking(false);
      running.current = false;
    }
  }, [load]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

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

  if (auth === null || (auth.status === "ok" && loading && !profile)) {
    return (
      <Boot
        hint={waking ? "Waking the server, this can take a minute" : "Preparing your mask…"}
      />
    );
  }

  if (!profile) {
    const reason = auth.status === "ok" ? "unreachable" : auth.status;
    const detail = "message" in auth ? auth.message : "";
    return (
      <Failure
        message={FAILURE_TEXT[reason] ?? "Something went wrong"}
        detail={detail}
        onRetry={() => {
          void bootstrap();
        }}
      />
    );
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
