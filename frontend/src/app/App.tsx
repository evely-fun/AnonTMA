import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { CallOverlay } from "@/features/friends/CallOverlay";
import { ChatPage } from "@/pages/ChatPage";
import { DailyPage } from "@/pages/DailyPage";
import { FriendsPage } from "@/pages/FriendsPage";
import { GamePage } from "@/pages/GamePage";
import { GamesPage } from "@/pages/GamesPage";
import { AdminPage } from "@/pages/AdminPage";
import { HomeDock, HomePage } from "@/pages/HomePage";
import { LeaderboardPage } from "@/pages/LeaderboardPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { PremiumPage } from "@/pages/PremiumPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { ShopPage } from "@/pages/ShopPage";
import { RoomPage } from "@/pages/RoomPage";
import { RoomsPage } from "@/pages/RoomsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { useI18n, useT } from "@/shared/i18n";
import { authenticate, type AuthOutcome } from "@/shared/lib/api";
import { ease, spring } from "@/shared/lib/motion";
import { isTelegram, setHapticsEnabled } from "@/shared/lib/telegram";
import { applyAppearance, watchScheme, type Palette, type ThemeMode } from "@/shared/lib/theme";
import { realtime } from "@/shared/lib/socket";
import { AmbientBackground, Avatar, Button, Toaster } from "@/shared/ui";
import { BoltIcon, CoinIcon, InfinityIcon, MaskIcon } from "@/shared/ui/icons";
import { useEconomy } from "@/store/economy";
import { useSession } from "@/store/session";

import { BottomNav } from "./BottomNav";
import { bindRealtime } from "./bridge";

const TAB_ROUTES = ["/", "/rooms", "/games", "/friends", "/profile"];

const FAILURE_KEYS: Record<string, { title: string; body: string }> = {
  "no-telegram": { title: "boot.openInTelegram", body: "boot.openInTelegramBody" },
  rejected: { title: "boot.rejected", body: "boot.rejectedBody" },
  unreachable: { title: "boot.unreachable", body: "boot.unreachableBody" },
};

const Splash = ({ waking }: { waking: boolean }) => {
  const { t } = useT();
  return (
    <m.div
      key="splash"
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
        {waking ? t("boot.waking") : t("boot.brand")}
      </span>
    </m.div>
  );
};

const Failure = ({
  kind,
  detail,
  onRetry,
}: {
  kind: string;
  detail?: string;
  onRetry: () => void;
}) => {
  const { t } = useT();
  const copy = FAILURE_KEYS[kind] ?? FAILURE_KEYS.unreachable;
  const outside = !isTelegram();
  return (
    <m.div
      key="failure"
      className="flex flex-1 flex-col items-center justify-center gap-3 px-9 text-center"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      transition={{ duration: 0.34, ease: ease.out }}
    >
      <h2 className="font-display text-[22px] font-extrabold tracking-[-0.025em]">
        {t(copy.title)}
      </h2>
      <p className="text-[14px] leading-snug text-secondary">{t(copy.body)}</p>
      {detail && <p className="text-[12px] text-hint">{detail}</p>}
      <Button
        className="mt-3"
        onClick={
          outside
            ? () => window.open("https://t.me/AnteikuAnonBot", "_blank", "noopener")
            : onRetry
        }
      >
        {outside ? t("boot.openBot") : t("common.retry")}
      </Button>
    </m.div>
  );
};

const CurrencyPill = ({
  label,
  to,
  tone,
  children,
}: {
  label: string;
  to: string;
  tone: "energy" | "coins";
  children: React.ReactNode;
}) => {
  const navigate = useNavigate();
  return (
    <m.button
      type="button"
      onClick={() => navigate(to)}
      whileTap={{ scale: 0.94 }}
      transition={spring.snappy}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-display text-[12.5px] font-bold tabular ${
        tone === "energy" ? "bg-warn/12 text-label" : "bg-elevated text-label"
      }`}
      aria-label={label}
    >
      {children}
    </m.button>
  );
};

const Currencies = () => {
  const state = useEconomy((store) => store.state);
  const coins = useSession((session) => session.profile?.stats.coins ?? 0);

  return (
    <>
      <CurrencyPill label="Energy" to="/daily" tone="energy">
        <BoltIcon size={13} className={state?.unlimited ? "text-accent" : "text-warn"} />
        {state?.unlimited ? <InfinityIcon size={14} className="text-accent" /> : (state?.energy ?? 0)}
      </CurrencyPill>
      <CurrencyPill label="Coins" to="/shop" tone="coins">
        <CoinIcon size={13} className="text-secondary" />
        {coins > 9999 ? `${Math.floor(coins / 1000)}k` : coins}
      </CurrencyPill>
    </>
  );
};

const TopBar = () => {
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
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
          ANTEIKU
        </m.button>
        <div className="flex items-center gap-2">
          <Currencies />
          <m.button
            type="button"
            onClick={() => navigate("/profile")}
            whileTap={{ scale: 0.95 }}
            transition={spring.snappy}
            className="relative"
            aria-label="Profile"
          >
            <Avatar
              seed={profile?.avatarSeed ?? "anon"}
              style={profile?.equipped?.avatar}
              frame={profile?.equipped?.frame}
              size={30}
            />
            <span
              className={`absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-[var(--bar-solid)] ${
                connection === "online" ? "bg-live" : "bg-hint"
              }`}
            />
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
  const loadEconomy = useEconomy((store) => store.load);
  const setLocale = useI18n((state) => state.setPreference);
  const [auth, setAuth] = useState<AuthOutcome | null>(null);
  const [waking, setWaking] = useState(false);
  const running = useRef(false);

  const theme = (profile?.preferences?.theme ?? "auto") as ThemeMode;
  const palette = (profile?.palette ?? "auto") as Palette;
  const uiLanguage = profile?.uiLanguage ?? "auto";

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
      void loadEconomy();
      realtime.connect();
    } finally {
      window.clearTimeout(slow);
      setWaking(false);
      running.current = false;
    }
  }, [load, loadEconomy]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    setHapticsEnabled(profile?.preferences?.haptics !== false);
  }, [profile?.preferences?.haptics]);

  useEffect(() => {
    applyAppearance(theme, palette);
    if (theme !== "auto") return;
    return watchScheme(() => applyAppearance(theme, palette));
  }, [theme, palette]);

  useEffect(() => {
    setLocale(uiLanguage === "en" || uiLanguage === "ru" ? uiLanguage : "auto");
  }, [uiLanguage, setLocale]);

  const booting = auth === null || (auth.status === "ok" && loading && !profile);
  const showChrome = TAB_ROUTES.includes(location.pathname);
  const onboarded = profile
    ? (profile.interests?.length ?? 0) > 0 || profile.stats.dialogsTotal > 0
    : true;

  return (
    <div className="app-shell relative mx-auto flex h-full max-w-[480px] flex-col text-label">
      <AmbientBackground />
      <AnimatePresence mode="wait" initial={false}>
        {booting && <Splash key="splash" waking={waking} />}

        {!booting && !profile && auth && (
          <Failure
            key="failure"
            kind={auth.status === "ok" ? "unreachable" : auth.status}
            detail={"message" in auth ? auth.message : undefined}
            onRetry={() => void bootstrap()}
          />
        )}

        {!booting && profile && !onboarded && (
          <m.div
            key="onboarding"
            className="flex h-full flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
          >
            <OnboardingPage />
          </m.div>
        )}

        {!booting && profile && onboarded && (
          <m.div
            key="shell"
            className="flex h-full flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.3, ease: ease.out }}
          >
            {showChrome && <TopBar />}
            <main className={`flex-1 overflow-y-auto ${showChrome ? "pb-24 pt-3" : ""}`}>
              <Routes location={location}>
                <Route path="/" element={<HomePage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/rooms" element={<RoomsPage />} />
                <Route path="/rooms/:roomId" element={<RoomPage />} />
                <Route path="/games" element={<GamesPage />} />
                <Route path="/games/:gameKey" element={<GamePage />} />
                <Route path="/friends" element={<FriendsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/daily" element={<DailyPage />} />
                <Route path="/premium" element={<PremiumPage />} />
                <Route path="/shop" element={<ShopPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/leaderboard" element={<LeaderboardPage />} />
                <Route path="*" element={<HomePage />} />
              </Routes>
            </main>
            {location.pathname === "/" && <HomeDock />}
            {showChrome && <BottomNav />}
          </m.div>
        )}
      </AnimatePresence>
      <CallOverlay />
      <Toaster />
    </div>
  );
};
