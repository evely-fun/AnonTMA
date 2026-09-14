import { m } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useBackButton } from "@/shared/hooks/useBackButton";
import { useT } from "@/shared/i18n";
import { clockFormat } from "@/shared/lib/format";
import { listStagger, rise } from "@/shared/lib/motion";
import { celebrate } from "@/shared/lib/celebrate";
import { haptic } from "@/shared/lib/telegram";
import {
  ArtTile,
  Button,
  Meter,
  Panel,
  PushScreen,
  RewardBurst,
  ScreenHeader,
  SectionHead,
  type RewardLine,
} from "@/shared/ui";
import { CheckIcon, CrownIcon, SparkleIcon } from "@/shared/ui/icons";
import { CoinMark, EnergyMark, StreakFlame } from "@/shared/ui/marks";
import { useEconomy } from "@/store/economy";
import { useSession } from "@/store/session";
import { toast } from "@/store/ui";

import {
  DailyChest,
  type DailyChestHandle,
} from "@/features/rewards/DailyChest";

export const DailyPage = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const state = useEconomy((store) => store.state);
  const spinning = useEconomy((store) => store.spinning);
  const load = useEconomy((store) => store.load);
  const spin = useEconomy((store) => store.spin);
  const claimStreak = useEconomy((store) => store.claimStreak);
  const refreshProfile = useSession((session) => session.refreshProfile);
  const chestRef = useRef<DailyChestHandle | null>(null);
  const [burst, setBurst] = useState<{
    title: string;
    lines: RewardLine[];
  } | null>(null);

  useBackButton("/");

  useEffect(() => {
    void load();
  }, [load]);

  const prizes = useMemo(() => state?.wheel.prizes ?? [], [state]);
  const spins = state?.wheel.spins ?? 0;
  const remaining = Math.max(
    0,
    (state?.wheel.requiredSeconds ?? 0) - (state?.wheel.voiceSecondsToday ?? 0),
  );

  const onSpin = async () => {
    if (spinning || spins <= 0 || prizes.length === 0) return;
    haptic.impact("medium");
    setBurst(null);
    const result = await spin();
    if (!result) {
      toast(t("errors.generic"), { tone: "danger" });
      return;
    }
    const prize = prizes.find((item) => item.key === result.key);
    await chestRef.current?.reveal(
      prize ?? { key: result.key, kind: result.kind, amount: result.amount },
    );
    haptic.notify("success");
    // The chest already shows the prize where the eye is. A second full screen
    // card naming the same number is noise, so only the streak claim, which
    // has nowhere of its own to land, raises one.
    celebrate(result.kind === "premium" ? "big" : "small");
    void refreshProfile();
  };

  const onClaim = async () => {
    const reward = await claimStreak();
    if (!reward) {
      toast(t("economy.claimed"));
      return;
    }
    haptic.notify("success");
    celebrate(reward.premiumDays > 0 ? "big" : "small");
    const lines: RewardLine[] = [
      {
        icon: <CoinMark size={18} />,
        label: t("common.coins"),
        value: `+${reward.coins}`,
        tone: "live",
      },
      {
        icon: <EnergyMark size={18} />,
        label: t("common.energy"),
        value: `+${reward.energy}`,
        tone: "warn",
      },
    ];
    if (reward.premiumDays > 0) {
      lines.push({
        icon: <CrownIcon size={18} />,
        label: t("common.premium"),
        value: `+${reward.premiumDays} d`,
        tone: "accent",
      });
    }
    setBurst({ title: t("economy.claimedToast"), lines });
    void refreshProfile();
  };

  const ladder = state?.streak.ladder ?? [];
  const streakDay = state?.streak.days ?? 0;

  return (
    <PushScreen>
      <ScreenHeader
        title={t("economy.dailyTitle")}
        subtitle={t("economy.daily")}
        onBack={() => navigate("/")}
      />

      <m.div
        className="flex-1 space-y-7 overflow-y-auto pb-[calc(28px+env(safe-area-inset-bottom))] pt-4"
        variants={listStagger}
        initial="initial"
        animate="animate"
      >
        <m.section variants={rise}>
          <SectionHead
            title={t("economy.wheel")}
            note={t("economy.wheelHint", {
              minutes: Math.round((state?.wheel.requiredSeconds ?? 1200) / 60),
              max: state?.wheel.maxPending ?? 3,
            })}
          />
          <div className="px-4">
            <div className="panel rounded-[24px] px-4 py-6">
              <DailyChest ref={chestRef} prizes={prizes} ready={spins > 0} />

              <div className="mt-6 flex flex-col items-center gap-2">
                <Button
                  full
                  size="lg"
                  variant={spins > 0 ? "primary" : "surface"}
                  loading={spinning}
                  disabled={spins <= 0}
                  onClick={() => void onSpin()}
                  icon={<SparkleIcon size={17} />}
                >
                  {spins > 0
                    ? `${t("economy.spin")} · ${spins}`
                    : t("economy.wheelLocked", {
                        time: clockFormat(remaining),
                      })}
                </Button>
                {spins <= 0 && (
                  <div className="w-full pt-1">
                    <Meter
                      ratio={
                        (state?.wheel.voiceSecondsToday ?? 0) /
                        Math.max(1, state?.wheel.requiredSeconds ?? 1)
                      }
                      tone="warn"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </m.section>

        <m.section variants={rise}>
          <SectionHead title={t("economy.streak")} />
          <Panel className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              {/* The flame is the counter. It grows with the run and changes
                  what it is made of, which is the only thing that can carry a
                  streak with no ceiling on it. */}
              <span className="flex items-center gap-2.5">
                <StreakFlame tier={state?.streak.tier} size={34} />
                <span className="min-w-0">
                  <span className="block font-display text-[15px] font-extrabold tracking-[-0.01em]">
                    {t("economy.streakDay", { day: streakDay })}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-hint">
                    {t(`economy.streakTier.${state?.streak.tier ?? "spark"}`)}
                  </span>
                </span>
              </span>
              {state?.streak.claimedToday ? (
                <span className="flex items-center gap-1.5 font-display text-[12.5px] font-bold text-hint">
                  <CheckIcon size={15} />
                  {t("economy.claimed")}
                </span>
              ) : (
                <Button size="sm" onClick={() => void onClaim()}>
                  {t("economy.claim")}
                </Button>
              )}
            </div>

            {/* The week in front of you rather than a fixed ladder, because
                the run does not stop at seven. */}
            <div className="mt-4 flex gap-1.5">
              {ladder.map((entry) => {
                const reached = entry.day <= streakDay;
                return (
                  <div
                    key={entry.day}
                    className={`flex h-9 flex-1 items-center justify-center rounded-[12px] font-display text-[13px] font-bold tabular ${
                      reached
                        ? "bg-accent text-on-accent"
                        : "bg-elevated text-hint"
                    }`}
                  >
                    {entry.premiumDays > 0 ? (
                      <CrownIcon size={15} />
                    ) : (
                      entry.day
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        </m.section>

        {/* The last card on the page was still the old tinted panel with a
            glyph on it, while every other destination in the app is drawn. */}
        <m.section className="px-4" variants={rise}>
          <ArtTile
            art="premium"
            title={t("economy.premiumTitle")}
            note={t("economy.premiumSubtitle")}
            onClick={() => navigate("/premium")}
            wide
          />
        </m.section>
      </m.div>

      <RewardBurst
        open={burst !== null}
        title={burst?.title ?? ""}
        lines={burst?.lines ?? []}
        onClose={() => setBurst(null)}
      />
    </PushScreen>
  );
};
