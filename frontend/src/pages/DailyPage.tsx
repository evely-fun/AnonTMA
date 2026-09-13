import { m } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useBackButton } from "@/shared/hooks/useBackButton";
import { useT } from "@/shared/i18n";
import { clockFormat } from "@/shared/lib/format";
import { listStagger, rise, spring } from "@/shared/lib/motion";
import { celebrate } from "@/shared/lib/celebrate";
import { haptic } from "@/shared/lib/telegram";
import {
  Button,
  Meter,
  Panel,
  PushScreen,
  RewardBurst,
  ScreenHeader,
  SectionHead,
  type RewardLine,
} from "@/shared/ui";
import { BoltIcon, CheckIcon, CoinIcon, CrownIcon, FlameIcon, SparkleIcon } from "@/shared/ui/icons";
import { useEconomy } from "@/store/economy";
import { useSession } from "@/store/session";
import { toast } from "@/store/ui";

import { PrizeWheel, type PrizeWheelHandle } from "@/features/rewards/PrizeWheel";

export const DailyPage = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const state = useEconomy((store) => store.state);
  const spinning = useEconomy((store) => store.spinning);
  const load = useEconomy((store) => store.load);
  const spin = useEconomy((store) => store.spin);
  const claimStreak = useEconomy((store) => store.claimStreak);
  const refreshProfile = useSession((session) => session.refreshProfile);
  const wheelRef = useRef<PrizeWheelHandle | null>(null);
  const [burst, setBurst] = useState<{ title: string; lines: RewardLine[] } | null>(null);

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
    const index = Math.max(0, prizes.findIndex((prize) => prize.key === result.key));
    await wheelRef.current?.spinTo(index);
    haptic.notify("success");
    celebrate(result.kind === "premium" ? "big" : "small");
    const icon =
      result.kind === "premium" ? <CrownIcon size={18} /> :
      result.kind === "energy" ? <BoltIcon size={18} /> : <CoinIcon size={18} />;
    setBurst({
      title: t("economy.youWon"),
      lines: [
        {
          icon,
          label: t(`economy.${result.kind === "premium" ? "premiumTitle" : result.kind === "energy" ? "energy" : "coins"}`),
          value: result.kind === "premium" ? `+${result.amount} d` : `+${result.amount}`,
          tone: result.kind === "premium" ? "accent" : result.kind === "energy" ? "warn" : "live",
        },
      ],
    });
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
      { icon: <CoinIcon size={18} />, label: t("common.coins"), value: `+${reward.coins}`, tone: "live" },
      { icon: <BoltIcon size={18} />, label: t("common.energy"), value: `+${reward.energy}`, tone: "warn" },
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
              <PrizeWheel
                prizes={prizes}
                handleRef={wheelRef}
                spins={spins}
                spinsLabel={t("economy.spinsLeft")}
              />

              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                {[
                  { kind: "energy", icon: <BoltIcon size={13} />, tone: "text-warn" },
                  { kind: "coins", icon: <CoinIcon size={13} />, tone: "text-live" },
                  { kind: "premium", icon: <CrownIcon size={13} />, tone: "text-accent" },
                ].map((group) => {
                  const amounts = prizes
                    .filter((prize) => prize.kind === group.kind)
                    .map((prize) => (group.kind === "premium" ? `${prize.amount}d` : prize.amount));
                  if (amounts.length === 0) return null;
                  return (
                    <span key={group.kind} className="flex items-center gap-1.5">
                      <span className={group.tone}>{group.icon}</span>
                      <span className="font-display text-[11.5px] font-bold text-hint tabular">
                        {amounts.join(" · ")}
                      </span>
                    </span>
                  );
                })}
              </div>

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
                    : t("economy.wheelLocked", { time: clockFormat(remaining) })}
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
              <span className="flex items-center gap-2 font-display text-[15px] font-extrabold tracking-[-0.01em]">
                <FlameIcon size={17} className="text-warn" />
                {t("economy.streakDay", { day: streakDay })}
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

            <div className="mt-4 flex gap-1.5">
              {ladder.map((entry) => {
                const reached = entry.day <= streakDay;
                return (
                  <m.div
                    key={entry.day}
                    whileTap={{ scale: 0.96 }}
                    transition={spring.snappy}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-[13px] py-2.5 ${
                      reached ? "bg-accent-quiet" : "bg-elevated/60"
                    }`}
                  >
                    <span
                      className={`font-display text-[10px] font-bold uppercase tracking-[0.08em] ${
                        reached ? "text-accent" : "text-hint"
                      }`}
                    >
                      {entry.day}
                    </span>
                    {entry.premiumDays > 0 ? (
                      <CrownIcon size={14} className={reached ? "text-accent" : "text-hint"} />
                    ) : (
                      <BoltIcon size={14} className={reached ? "text-accent" : "text-hint"} />
                    )}
                  </m.div>
                );
              })}
            </div>
          </Panel>
        </m.section>

        <m.section className="px-4" variants={rise}>
          <button
            type="button"
            onClick={() => navigate("/premium")}
            className="panel-hero flex w-full items-center gap-3 rounded-[20px] px-4 py-4 text-left"
          >
            <CrownIcon size={20} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[15px] font-extrabold tracking-[-0.01em]">
                {t("economy.premiumTitle")}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-hint">
                {t("economy.premiumSubtitle")}
              </span>
            </span>
          </button>
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
