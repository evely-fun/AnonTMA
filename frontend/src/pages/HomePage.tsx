import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useT } from "@/shared/i18n";
import { listStagger, rise, spring } from "@/shared/lib/motion";
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
  GiftIcon,
  MicIcon,
  RoomsIcon,
  ShieldIcon,
} from "@/shared/ui/icons";
import { useChat } from "@/store/chat";
import { useEconomy } from "@/store/economy";
import { useSession } from "@/store/session";
import { useSocial } from "@/store/social";

export const HomePage = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const presence = useSession((state) => state.presence);
  const economy = useEconomy((store) => store.state);
  const startSearch = useChat((state) => state.startSearch);
  const loadSocial = useSocial((state) => state.load);
  const friends = useSocial((state) => state.friends);
  const [mode, setMode] = useState<"voice" | "text">("voice");

  useEffect(() => {
    void loadSocial();
  }, [loadSocial]);

  const online = friends.filter((friend) => friend.isOnline);
  const progress = profile?.progress;
  const cost = economy?.costs?.[mode] ?? 0;
  const unlimited = economy?.unlimited ?? false;

  const begin = () => {
    haptic.impact("medium");
    startSearch(mode);
    navigate("/chat");
  };

  return (
    <TabScreen>
      <m.div className="space-y-8 pb-4" variants={listStagger} initial="initial" animate="animate">
        <m.section className="px-4" variants={rise}>
          <div className="panel-hero relative overflow-hidden rounded-[24px] px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="block font-display text-[11px] font-bold uppercase tracking-[0.14em] text-hint">
                  {t("home.peopleOnline")}
                </span>
                <span className="mt-1.5 flex items-baseline gap-2 font-display text-[38px] font-extrabold leading-none tracking-[-0.04em] tabular">
                  <AnimatedNumber value={presence.online} />
                  {presence.searching > 0 && (
                    <span className="text-[13px] font-bold tracking-normal text-live">
                      {t("home.searching", { count: presence.searching })}
                    </span>
                  )}
                </span>
              </div>
              <span className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--sheen)] text-label">
                {mode === "voice" ? <MicIcon size={21} /> : <ChatIcon size={21} />}
              </span>
            </div>

            <p className="mt-4 max-w-[280px] text-[13.5px] leading-snug text-secondary">
              {t("home.tagline")}
            </p>

            <div className="mt-5">
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
              className="primary-action mt-3 flex h-[54px] w-full items-center justify-center gap-2 rounded-[17px] font-display text-[16px] font-extrabold tracking-[-0.01em]"
            >
              <BoltIcon size={18} />
              {t("home.findNow")}
            </m.button>

            <p className="mt-2 text-center font-display text-[11px] font-bold uppercase tracking-[0.1em] text-hint tabular">
              {unlimited ? t("home.free") : t("home.cost", { count: cost })}
            </p>
          </div>
        </m.section>

        {progress && (
          <m.section className="px-4" variants={rise}>
            <div className="panel rounded-[20px] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="font-display text-[15px] font-extrabold tracking-[-0.01em]">
                    {t(`titles.${progress.title}`)}
                  </span>
                  <span className="ml-2 font-display text-[12px] font-bold uppercase tracking-[0.1em] text-hint">
                    {t("common.level")} {progress.level}
                  </span>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-warn/15 px-2.5 py-1 font-display text-[12px] font-bold text-warn tabular">
                  <FlameIcon size={13} />
                  {profile?.stats.streakDays ?? 0}
                </span>
              </div>
              <div className="mt-3">
                <Meter ratio={progress.ratio} />
              </div>
              <p className="mt-2 font-display text-[11px] font-bold uppercase tracking-[0.1em] text-hint tabular">
                {t("home.xpOf", { current: progress.xpIntoLevel, total: progress.xpForNext })}
              </p>
            </div>
          </m.section>
        )}

        {online.length > 0 && (
          <m.section variants={rise}>
            <SectionHead
              title={t("home.friendsOnline")}
              trailing={
                <button
                  type="button"
                  onClick={() => navigate("/friends")}
                  className="font-display text-[12px] font-bold uppercase tracking-[0.1em] text-accent"
                >
                  {t("common.all")}
                </button>
              }
            />
            <div className="flex gap-3.5 overflow-x-auto px-5 pb-1">
              {online.slice(0, 8).map((friend) => (
                <m.button
                  key={friend.id}
                  type="button"
                  onClick={() => navigate("/friends")}
                  whileTap={{ scale: 0.94 }}
                  transition={spring.snappy}
                  className="flex w-[58px] shrink-0 flex-col items-center gap-1.5"
                >
                  <Avatar seed={friend.avatarSeed} size={50} online />
                  <span className="w-full truncate text-center text-[11px] font-semibold text-hint">
                    {friend.anonName.split(" ")[0]}
                  </span>
                </m.button>
              ))}
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
                  <GiftIcon size={19} />
                </IconTile>
              }
              title={t("home.daily")}
              subtitle={t("home.dailyHint")}
              trailing={
                (economy?.wheel.spins ?? 0) > 0 ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-accent font-display text-[11px] font-extrabold text-bg">
                    {economy?.wheel.spins}
                  </span>
                ) : undefined
              }
              chevron
              onClick={() => navigate("/daily")}
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
          <div className="flex items-start gap-3 rounded-[18px] border border-separator px-4 py-3.5">
            <span className="mt-0.5 text-hint">
              <ShieldIcon size={18} />
            </span>
            <p className="text-[12.5px] leading-snug text-hint">{t("home.privacy")}</p>
          </div>
        </m.section>
      </m.div>
    </TabScreen>
  );
};
