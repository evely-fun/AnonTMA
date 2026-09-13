import { m } from "motion/react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useT } from "@/shared/i18n";
import { clockFormat } from "@/shared/lib/format";
import { listStagger, rise, spring } from "@/shared/lib/motion";
import { peerManager } from "@/features/voice/webrtc";
import { haptic } from "@/shared/lib/telegram";
import {
  AnimatedNumber,
  Avatar,
  IconTile,
  ListRow,
  Meter,
  Panel,
  SectionHead,
  Segmented,
  TabScreen,
} from "@/shared/ui";
import {
  BoltIcon,
  ChatIcon,
  CrownIcon,
  FlameIcon,
  GamesIcon,
  GridIcon,
  MicIcon,
  RoomsIcon,
  ShieldIcon,
  WheelIcon,
} from "@/shared/ui/icons";
import { useChat } from "@/store/chat";
import { useEconomy } from "@/store/economy";
import { useSession } from "@/store/session";
import { useSocial } from "@/store/social";
import { useVoice } from "@/store/voice";

const RING = 34;
const CIRCUMFERENCE = 2 * Math.PI * RING;

const WheelCard = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const state = useEconomy((store) => store.state);
  if (!state) return null;

  const spins = state.wheel.spins;
  const done = state.wheel.voiceSecondsToday;
  const need = Math.max(1, state.wheel.requiredSeconds);
  const ratio = Math.min(1, done / need);
  const ready = spins > 0;

  return (
    <m.button
      type="button"
      variants={rise}
      onPointerDown={() => haptic.select()}
      onClick={() => navigate("/daily")}
      whileTap={{ scale: 0.985 }}
      transition={spring.snappy}
      className={`flex w-full items-center gap-4 rounded-[20px] px-4 py-3.5 text-left ${
        ready ? "panel-hero" : "panel"
      }`}
    >
      <span className="relative flex size-[76px] shrink-0 items-center justify-center">
        <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
          <circle cx="38" cy="38" r={RING} className="fill-none stroke-elevated" strokeWidth="4" />
          <circle
            cx="38"
            cy="38"
            r={RING}
            className="fill-none stroke-separator"
            strokeWidth="1"
          />
          <m.circle
            cx="38"
            cy="38"
            r={RING}
            className={`fill-none ${ready ? "stroke-accent" : "stroke-warn"}`}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - (ready ? 1 : ratio)) }}
            transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
          />
        </svg>
        <m.span
          className={`absolute ${ready ? "text-accent" : "text-secondary"}`}
          animate={ready ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 2.6, repeat: ready ? Infinity : 0, ease: "easeInOut" }}
        >
          <WheelIcon size={26} />
        </m.span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-display text-[15.5px] font-extrabold tracking-[-0.015em]">
          {t("economy.wheel")}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-hint">
          {ready
            ? t("economy.wheelReady", { count: spins })
            : t("economy.wheelLocked", { time: clockFormat(Math.max(0, need - done)) })}
        </span>
      </span>

      {ready && (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent font-display text-[12px] font-extrabold text-on-accent tabular">
          {spins}
        </span>
      )}
    </m.button>
  );
};

export const HomeDock = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const mode = useChat((state) => state.mode);
  const setMode = useChat((state) => state.setMode);
  const startSearch = useChat((state) => state.startSearch);
  const economy = useEconomy((store) => store.state);

  const cost = economy?.costs?.[mode] ?? 0;
  const unlimited = economy?.unlimited ?? false;
  const short = !unlimited && (economy?.energy ?? 0) < cost;

  const begin = () => {
    if (short) {
      haptic.notify("warning");
      navigate("/daily");
      return;
    }
    haptic.impact("medium");
    void peerManager.unlock();
    // Warming the microphone here means the stream is ready by the time a match
    // lands, instead of racing the first offer.
    if (mode === "voice") {
      void useVoice.getState().enable();
    }
    startSearch(mode);
    navigate("/chat");
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] px-4 pb-[calc(72px+env(safe-area-inset-bottom))]">
      <span className="dock-scrim pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[210px]" />
      <m.div
        className="nav-island pointer-events-auto flex items-center gap-2.5 rounded-[20px] p-2"
        initial={{ y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.38, ease: [0.23, 1, 0.32, 1] }}
      >
        <div className="w-[112px] shrink-0">
          <Segmented
            id="mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "voice" as const, label: t("home.voice") },
              { value: "text" as const, label: t("home.text") },
            ]}
          />
        </div>
        <m.button
          type="button"
          onClick={begin}
          whileTap={{ scale: 0.97 }}
          transition={spring.snappy}
          className={`flex h-[46px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[15px] px-2 font-display text-[14.5px] font-extrabold tracking-[-0.015em] ${
            short ? "bg-elevated text-hint" : "primary-action"
          }`}
        >
          {mode === "voice" ? <MicIcon size={17} /> : <ChatIcon size={17} />}
          {short ? t("economy.notEnough") : t("home.findNow")}
          {!short && !unlimited && (
            <span className="font-display text-[12px] font-bold opacity-55 tabular">{cost}</span>
          )}
        </m.button>
      </m.div>
    </div>
  );
};

export const HomePage = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const presence = useSession((state) => state.presence);
  const economy = useEconomy((store) => store.state);
  const loadSocial = useSocial((state) => state.load);
  const friends = useSocial((state) => state.friends);

  useEffect(() => {
    void loadSocial();
  }, [loadSocial]);

  const online = friends.filter((friend) => friend.isOnline);
  const progress = profile?.progress;

  return (
    <TabScreen>
      <m.div
        className="space-y-7 pb-[186px]"
        variants={listStagger}
        initial="initial"
        animate="animate"
      >
        <m.section className="px-4" variants={rise}>
          <div className="panel-hero relative overflow-hidden rounded-[22px] px-5 py-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <span className="block font-display text-[11px] font-bold uppercase tracking-[0.14em] text-hint">
                  {t("home.peopleOnline")}
                </span>
                <span className="mt-1 flex items-baseline gap-2 font-display text-[34px] font-extrabold leading-none tracking-[-0.04em] tabular">
                  <AnimatedNumber value={presence.online} />
                  {presence.searching > 0 && (
                    <span className="text-[12.5px] font-bold tracking-normal text-live">
                      {t("home.searching", { count: presence.searching })}
                    </span>
                  )}
                </span>
              </div>
              {online.length > 0 && (
                <button
                  type="button"
                  onClick={() => navigate("/friends")}
                  className="flex items-center"
                  aria-label={t("home.friendsOnline")}
                >
                  {online.slice(0, 4).map((friend, index) => (
                    <span key={friend.id} style={{ marginLeft: index === 0 ? 0 : -10 }}>
                      <Avatar
                        seed={friend.avatarSeed}
                        style={friend.avatarStyle}
                        size={28}
                        className="ring-2 ring-[var(--color-surface)]"
                      />
                    </span>
                  ))}
                </button>
              )}
            </div>
            <p className="mt-3 max-w-[290px] text-[13px] leading-snug text-secondary">
              {t("home.tagline")}
            </p>
          </div>
        </m.section>

        <m.section className="px-4" variants={rise}>
          <WheelCard />
        </m.section>

        {progress && (
          <m.section className="px-4" variants={rise}>
            <div className="panel rounded-[20px] px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-display text-[14.5px] font-extrabold tracking-[-0.01em]">
                    {t(`titles.${progress.title}`)}
                  </span>
                  <span className="ml-2 font-display text-[11.5px] font-bold uppercase tracking-[0.1em] text-hint">
                    {t("common.level")} {progress.level}
                  </span>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-warn/15 px-2.5 py-1 font-display text-[12px] font-bold text-warn tabular">
                  <FlameIcon size={13} />
                  {profile?.stats.streakDays ?? 0}
                </span>
              </div>
              <div className="mt-2.5">
                <Meter ratio={progress.ratio} />
              </div>
              <p className="mt-1.5 font-display text-[10.5px] font-bold uppercase tracking-[0.1em] text-hint tabular">
                {t("home.xpOf", { current: progress.xpIntoLevel, total: progress.xpForNext })}
              </p>
            </div>
          </m.section>
        )}

        <m.section variants={rise}>
          <SectionHead title={t("home.explore")} />
          <Panel divided>
            <ListRow
              leading={
                <IconTile tone="accent">
                  <RoomsIcon size={19} />
                </IconTile>
              }
              title={t("home.voiceRooms")}
              subtitle={t("home.voiceRoomsHint")}
              chevron
              onClick={() => navigate("/rooms")}
            />
            <ListRow
              leading={
                <IconTile tone="live">
                  <GamesIcon size={19} />
                </IconTile>
              }
              title={t("home.games")}
              subtitle={t("home.gamesHint")}
              chevron
              onClick={() => navigate("/games")}
            />
            <ListRow
              leading={
                <IconTile tone="warn">
                  <GridIcon size={19} />
                </IconTile>
              }
              title={t("shop.title")}
              subtitle={t("shop.hint")}
              trailing={
                <span className="flex items-center gap-1 font-display text-[12px] font-bold text-hint tabular">
                  <BoltIcon size={11} className="text-warn" />
                  {(profile?.stats.coins ?? 0).toLocaleString("en-US")}
                </span>
              }
              chevron
              onClick={() => navigate("/shop")}
            />
            <ListRow
              leading={
                <IconTile tone="neutral">
                  <CrownIcon size={19} />
                </IconTile>
              }
              title={t("home.leaderboard")}
              subtitle={t("home.leaderboardHint")}
              chevron
              onClick={() => navigate("/leaderboard")}
            />
          </Panel>
        </m.section>

        <m.section className="px-4" variants={rise}>
          <div className="quiet-panel flex items-start gap-3 rounded-[18px] px-4 py-3.5">
            <span className="mt-0.5 text-hint">
              <ShieldIcon size={18} />
            </span>
            <p className="text-[12.5px] leading-snug text-hint">{t("home.privacy")}</p>
          </div>
        </m.section>

        {economy?.unlimited && (
          <m.p
            className="px-5 text-center font-display text-[11px] font-bold uppercase tracking-[0.12em] text-accent"
            variants={rise}
          >
            {t("home.free")}
          </m.p>
        )}
      </m.div>
    </TabScreen>
  );
};
