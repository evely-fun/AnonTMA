import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";

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
import { ease, spring } from "@/shared/lib/motion";
import { isTelegram, setHapticsEnabled } from "@/shared/lib/telegram";
import { realtime } from "@/shared/lib/socket";
import { AmbientBackground, Avatar, Button, Toaster } from "@/shared/ui";
import { BoltIcon, MaskIcon } from "@/shared/ui/icons";
import { useSession } from "@/store/session";

import { BottomNav } from "./BottomNav";
import { bindRealtime } from "./bridge";

const TAB_ROUTES = ["/", "/rooms", "/games", "/friends", "/profile"];

const FAILURE: Record<string, { title: string; body: string }> = {
  "no-telegram": {
    title: "Open this in Telegram",
    body: "Anon runs inside the Telegram app. Launch it from the bot.",
  },
  rejected: {
    title: "Session not confirmed",
    body: "Telegram would not confirm this session. Close the app and open it again from the bot.",
  },
  unreachable: {
    title: "Cannot reach the server",
    body: "The connection failed. The server may be waking up, try again in a moment.",
  },
};

const Splash = ({ hint }: { hint: string }) => (
  <m.div
    className="flex flex-1 flex-col items-center justify-center gap-5"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0, transition: { duration: 0.2 } }}
  >
    <m.span
      className="text-accent"
      animate={{ scale: [1, 1.08, 1], opacity: [0.65, 1, 0.65] }}
      transition={{ duration: 1.7, repeat: Infinity, ease: "easeInOut" }}
    >
      <MaskIcon size={52} />
    </m.span>
    <span className="font-display text-[11px] font-bold uppercase tracking-[0.24em] text-hint">
      {hint}
    </span>
  </m.div>
);

const Failure = ({
  kind,
  detail,
  onRetry,
}: {
  kind: string;
  detail?: string;
  onRetry: () => void;
}) => {
  const copy = FAILURE[kind] ?? FAILURE.unreachable;
  const outside = !isTelegram();
  return (
    <m.div
      className="flex flex-1 flex-col items-center justify-center gap-3 px-9 text-center"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, ease: ease.out }}
    >
      <h2 className="font-display text-[22px] font-extrabold tracking-[-0.025em]">{copy.title}</h2>
      <p className="text-[14px] leading-snug text-secondary">{copy.body}</p>
      {detail && <p className="text-[12px] text-hint">{detail}</p>}
      <Button
        className="mt-3"
        onClick={
          outside
            ? () => window.open("https://t.me/AnteikuAnonBot", "_blank", "noopener")
            : onRetry
        }
      >
        {outside ? "Open the bot" : "Try again"}
      </Button>
    </m.div>
  );
};

const TopBar = () => {
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const presence = useSession((state) => state.presence);
  const connection = useSession((state) => state.connection);

  return (
    <header className="top-status-bar sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center justify-between px-4">
        <m.button
          type="button"
          onClick={() => navigate("/")}
          whileTap={{ scale: 0.95 }}
          transition={spring.snappy}
          className="-mx-1 rounded-lg px-1 font-display text-[19px] font-extrabold uppercase tracking-[0.08em] text-label"
          aria-label="Home"
        >
          ANON
        </m.button>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1.5 font-display text-[12.5px] font-bold tabular">
            <span
              className={`size-1.5 rounded-full ${connection === "online" ? "bg-live" : "bg-hint"}`}
            />
            {presence.online}
          </div>
          <m.button
            type="button"
            onClick={() => navigate("/profile")}
            whileTap={{ scale: 0.95 }}
            transition={spring.snappy}
            className="flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1.5 font-display text-[12.5px] font-bold tabular"
            aria-label="Coins"
          >
            <BoltIcon size={13} className="text-warn" />
            {(profile?.stats.coins ?? 0).toLocaleString("en-US")}
          </m.button>
          <m.button
            type="button"
            onClick={() => navigate("/profile")}
            whileTap={{ scale: 0.95 }}
            transition={spring.snappy}
            aria-label="Profile"
          >
            <Avatar seed={profile?.avatarSeed ?? "anon"} size={30} />
          </m.button>
        </div>
      </div>
    </header>
  );
};

export const App = () => {
  const location = useLocation();
  const loading = useSession((state) => state.loading);
  const profile = useSession((state) => state.profile);
  const load = useSession((state) => state.load);
  const [auth, setAuth] = useState<AuthOutcome | null>(null);
  const [waking, setWaking] = useState(false);
  const running = useRef(false);

  const bootstrap = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setAuth(null);
    const slow = window.setTimeout(() => setWaking(true), 4000);
    try {
      const outcome = await authenticate();
      setAuth(outcome);
      if (outcome.status !== "ok") return;
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
    setHapticsEnabled(profile?.preferences?.haptics !== false);
  }, [profile?.preferences?.haptics]);

  const booting = auth === null || (auth.status === "ok" && loading && !profile);
  const showChrome = TAB_ROUTES.includes(location.pathname);
  const onboarded = profile
    ? (profile.interests?.length ?? 0) > 0 || profile.stats.dialogsTotal > 0
    : true;

  return (
    <div className="app-shell relative mx-auto flex h-full max-w-[480px] flex-col text-label">
      <AmbientBackground />
      <AnimatePresence mode="wait" initial={false}>
        {booting && <Splash key="splash" hint={waking ? "waking the server" : "anon"} />}

        {!booting && !profile && auth && (
          <Failure
            key="failure"
            kind={auth.status === "ok" ? "unreachable" : auth.status}
            detail={"message" in auth ? auth.message : undefined}
            onRetry={() => void bootstrap()}
          />
        )}

        {!booting && profile && !onboarded && <OnboardingPage key="onboarding" />}

        {!booting && profile && onboarded && (
          <m.div
            key="shell"
            className="flex h-full flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: ease.out }}
          >
            {showChrome && <TopBar />}
            <main className={`flex-1 overflow-y-auto ${showChrome ? "pb-24 pt-3" : ""}`}>
              <AnimatePresence mode="wait" initial={false}>
                <Routes location={location} key={location.pathname}>
                  <Route path="/" element={<HomePage />} />
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
            </main>
            {showChrome && <BottomNav />}
          </m.div>
        )}
      </AnimatePresence>
      <CallOverlay />
      <Toaster />
    </div>
  );
};
