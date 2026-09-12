import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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
  MicIcon,
  RoomsIcon,
  ShieldIcon,
} from "@/shared/ui/icons";
import { useChat } from "@/store/chat";
import { useSession } from "@/store/session";
import { useSocial } from "@/store/social";

export const HomePage = () => {
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const presence = useSession((state) => state.presence);
  const startSearch = useChat((state) => state.startSearch);
  const loadSocial = useSocial((state) => state.load);
  const friends = useSocial((state) => state.friends);
  const [mode, setMode] = useState<"voice" | "text">("voice");

  useEffect(() => {
    void loadSocial();
  }, [loadSocial]);

  const online = friends.filter((friend) => friend.isOnline);
  const progress = profile?.progress;

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
                  People online
                </span>
                <span className="mt-1.5 flex items-baseline gap-2 font-display text-[38px] font-extrabold leading-none tracking-[-0.04em] tabular">
                  <AnimatedNumber value={presence.online} />
                  {presence.searching > 0 && (
                    <span className="text-[13px] font-bold tracking-normal text-live">
                      {presence.searching} searching
                    </span>
                  )}
                </span>
              </div>
              <span className="flex size-11 items-center justify-center rounded-[14px] bg-[oklch(1_0_0/0.08)] text-label">
                {mode === "voice" ? <MicIcon size={21} /> : <ChatIcon size={21} />}
              </span>
            </div>

            <p className="mt-4 max-w-[280px] text-[13.5px] leading-snug text-secondary">
              A new mask every conversation. Nothing links back to your Telegram account unless you
              both reveal.
            </p>

            <div className="mt-5">
              <Segmented
                id="mode"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "voice", label: "Voice" },
                  { value: "text", label: "Text" },
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
              Find someone now
            </m.button>
          </div>
        </m.section>

        {progress && (
          <m.section className="px-4" variants={rise}>
            <div className="panel rounded-[20px] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="font-display text-[15px] font-extrabold tracking-[-0.01em]">
                    {progress.title}
                  </span>
                  <span className="ml-2 font-display text-[12px] font-bold uppercase tracking-[0.1em] text-hint">
                    level {progress.level}
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
                {progress.xpIntoLevel} / {progress.xpForNext} xp
              </p>
            </div>
          </m.section>
        )}

        {online.length > 0 && (
          <m.section variants={rise}>
            <SectionHead
              title="Friends online"
              trailing={
                <button
                  type="button"
                  onClick={() => navigate("/friends")}
                  className="font-display text-[12px] font-bold uppercase tracking-[0.1em] text-accent"
                >
                  all
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
          <SectionHead title="Explore" />
          <Panel divided>
            <ListRow
              leading={
                <IconTile tone="accent">
                  <RoomsIcon size={19} />
                </IconTile>
              }
              title="Voice rooms"
              subtitle="Open tables you can drop into"
              chevron
              onClick={() => navigate("/rooms")}
            />
            <ListRow
              leading={
                <IconTile tone="live">
                  <GamesIcon size={19} />
                </IconTile>
              }
              title="Games"
              subtitle="Mafia, Alias, Telephone and more"
              chevron
              onClick={() => navigate("/games")}
            />
            <ListRow
              leading={
                <IconTile tone="warn">
                  <CrownIcon size={19} />
                </IconTile>
              }
              title="Leaderboard"
              subtitle="Where you stand this week"
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
            <p className="text-[12.5px] leading-snug text-hint">
              Your Telegram name, photo and username stay hidden. Reports are reviewed and repeat
              offenders lose access.
            </p>
          </div>
        </m.section>
      </m.div>
    </TabScreen>
  );
};
