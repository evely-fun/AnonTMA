import { m } from "motion/react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { peerManager } from "@/features/voice/webrtc";
import { useT } from "@/shared/i18n";
import { clockFormat } from "@/shared/lib/format";
import { listStagger, rise, spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import { Avatar, Meter, Segmented, TabScreen } from "@/shared/ui";
import {
  BoltIcon,
  ChatIcon,
  CoinIcon,
  FlameIcon,
  MicIcon,
  WheelIcon,
} from "@/shared/ui/icons";
import { useChat } from "@/store/chat";
import { useEconomy } from "@/store/economy";
import { useSession } from "@/store/session";
import { useSocial } from "@/store/social";
import { useVoice } from "@/store/voice";

/**
 * One screen, one job. Everything that is not "start a conversation" is either
 * a tab of its own or lives in the profile, so nothing competes with the
 * button in the middle.
 */
export const HomePage = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const presence = useSession((state) => state.presence);
  const economy = useEconomy((store) => store.state);
  const loadSocial = useSocial((state) => state.load);
  const friends = useSocial((state) => state.friends);

  const mode = useChat((state) => state.mode);
  const setMode = useChat((state) => state.setMode);
  const startSearch = useChat((state) => state.startSearch);

  useEffect(() => {
    void loadSocial();
  }, [loadSocial]);

  const online = friends.filter((friend) => friend.isOnline);
  const cost = economy?.costs?.[mode] ?? 0;
  const unlimited = economy?.unlimited ?? false;
  const energy = economy?.energy ?? 0;
  const energyMax = economy?.energyMax ?? 100;
  const short = !unlimited && energy < cost;
  const spins = economy?.wheel.spins ?? 0;

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
    <TabScreen>
      <m.div
        className="flex min-h-full flex-col gap-6 px-4 pb-6"
        variants={listStagger}
        initial="initial"
        animate="animate"
      >
        <m.p variants={rise} className="pt-1 text-[13.5px] text-secondary">
          {t("home.peopleOnline")}{" "}
          <span className="font-display font-bold text-label tabular">
            {presence?.online ?? 1}
          </span>
        </m.p>

        <m.section variants={rise} className="flex flex-1 flex-col justify-center gap-5 py-2">
          <Segmented
            id="mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "voice" as const, label: t("home.voice") },
              { value: "text" as const, label: t("home.text") },
            ]}
          />

          <m.button
            type="button"
            onClick={begin}
            onPointerDown={() => haptic.select()}
            whileTap={{ scale: 0.97 }}
            transition={spring.snappy}
            className={`flex w-full flex-col items-center gap-3 rounded-[28px] px-6 py-9 ${
              short ? "bg-elevated text-hint" : "primary-action"
            }`}
          >
            <span className="flex size-[54px] items-center justify-center rounded-full bg-current/10">
              {mode === "voice" ? <MicIcon size={26} /> : <ChatIcon size={26} />}
            </span>
            <span className="font-display text-[21px] font-extrabold tracking-[-0.02em]">
              {short ? t("economy.notEnough") : t("home.findNow")}
            </span>
            <span className="text-[13px] opacity-70">
              {short
                ? t("home.topUp")
                : unlimited
                  ? t("home.free")
                  : t("home.cost", { count: cost })}
            </span>
          </m.button>

          <p className="px-4 text-center text-[12.5px] leading-snug text-hint">
            {t("home.tagline")}
          </p>
        </m.section>

        <m.button
          variants={rise}
          type="button"
          onClick={() => navigate("/daily")}
          whileTap={{ scale: 0.985 }}
          transition={spring.snappy}
          className="panel flex items-center gap-4 rounded-[20px] px-4 py-3.5 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[13px] text-secondary">
              <BoltIcon size={15} className="text-warn" />
              {unlimited ? (
                t("home.free")
              ) : (
                <span className="tabular">
                  {energy} / {energyMax}
                </span>
              )}
            </span>
            <span className="mt-2 block">
              <Meter ratio={unlimited ? 1 : energy / Math.max(1, energyMax)} tone="warn" />
            </span>
          </span>

          <span className="flex items-center gap-1.5 text-[13px] text-secondary tabular">
            <CoinIcon size={15} />
            {profile?.stats?.coins ?? 0}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-secondary tabular">
            <FlameIcon size={15} className="text-warn" />
            {economy?.streak.days ?? 0}
          </span>
        </m.button>

        {spins > 0 && (
          <m.button
            variants={rise}
            type="button"
            onClick={() => navigate("/daily")}
            whileTap={{ scale: 0.985 }}
            transition={spring.snappy}
            className="panel-hero flex items-center gap-3.5 rounded-[20px] px-4 py-4 text-left"
          >
            <WheelIcon size={24} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[15px] font-bold">
                {t("economy.wheel")}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-secondary">
                {t("economy.wheelReady", { count: spins })}
              </span>
            </span>
          </m.button>
        )}

        {online.length > 0 && (
          <m.button
            variants={rise}
            type="button"
            onClick={() => navigate("/friends")}
            whileTap={{ scale: 0.985 }}
            transition={spring.snappy}
            className="flex items-center gap-3 rounded-[20px] px-1 py-1 text-left"
          >
            <span className="flex -space-x-2.5">
              {online.slice(0, 4).map((friend) => (
                <Avatar
                  key={friend.id}
                  seed={friend.avatarSeed}
                  style={friend.avatarStyle}
                  size={30}
                  className="ring-2 ring-bg"
                />
              ))}
            </span>
            <span className="text-[13px] text-secondary">
              {t("home.friendsOnlineCount", { count: online.length })}
            </span>
          </m.button>
        )}
      </m.div>
    </TabScreen>
  );
};

/** Kept for the wheel countdown copy used by the daily screen. */
export const wheelCountdown = (done: number, need: number): string =>
  clockFormat(Math.max(0, need - done));
