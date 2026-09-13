import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useBackButton } from "@/shared/hooks/useBackButton";
import { useT } from "@/shared/i18n";
import { request } from "@/shared/lib/api";
import { listStagger, rise } from "@/shared/lib/motion";
import { Meter, PushScreen, ScreenHeader, SectionHead, Skeleton } from "@/shared/ui";
import { BoltIcon, CheckIcon, CoinIcon, CrownIcon, LockIcon } from "@/shared/ui/icons";

interface Rung {
  level: number;
  xpTotal: number;
  title: string;
  newTitle: boolean;
  energyBonus: number;
  coinBonus: number;
  reached: boolean;
}

interface Levels {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  ratio: number;
  title: string;
  energyBonus: number;
  coinBonus: number;
  ladder: Rung[];
}

const Perk = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <span className="flex items-center gap-1.5 text-[12px] text-secondary">
    <span className="text-accent">{icon}</span>
    {label}
  </span>
);

export const LevelsPage = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const [data, setData] = useState<Levels | null>(null);

  useBackButton("/profile");

  useEffect(() => {
    void request<Levels>("/users/me/levels")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const next = data?.ladder.find((rung) => !rung.reached);

  return (
    <PushScreen>
      <ScreenHeader
        title={t("progression.title")}
        subtitle={t("progression.subtitle")}
        onBack={() => navigate("/profile")}
      />

      <div className="flex-1 overflow-y-auto pb-[calc(28px+env(safe-area-inset-bottom))] pt-4">
        {!data ? (
          <div className="space-y-2 px-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-[76px]" />
            ))}
          </div>
        ) : (
          <m.div variants={listStagger} initial="initial" animate="animate" className="space-y-6">
            <m.section className="px-4" variants={rise}>
              <div className="panel-hero rounded-[22px] px-5 py-4">
                <p className="font-display text-[11px] font-bold tracking-[0.01em] text-hint">
                  {t("progression.current")}
                </p>
                <p className="mt-1 font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] tabular">
                  {data.level}
                  <span className="ml-2 text-[15px] tracking-[-0.01em] text-accent">
                    {t(`titles.${data.title}`)}
                  </span>
                </p>
                <div className="mt-3">
                  <Meter ratio={data.ratio} />
                </div>
                <p className="mt-2 font-display text-[11px] font-bold tracking-[0.1em] text-hint tabular">
                  {data.xpIntoLevel} / {data.xpForNext} XP
                  {next && ` · ${t("progression.needXp", { count: data.xpForNext - data.xpIntoLevel })}`}
                </p>

                {(data.energyBonus > 0 || data.coinBonus > 0) && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                    {data.energyBonus > 0 && (
                      <Perk
                        icon={<BoltIcon size={13} />}
                        label={t("progression.perkEnergy", { count: data.energyBonus })}
                      />
                    )}
                    {data.coinBonus > 0 && (
                      <Perk
                        icon={<CoinIcon size={13} />}
                        label={t("progression.perkCoins", { count: data.coinBonus })}
                      />
                    )}
                  </div>
                )}
              </div>
            </m.section>

            <m.section variants={rise}>
              <SectionHead title={t("progression.next")} note={t("progression.howXp")} />
              <div className="list-window space-y-2 px-4">
                {data.ladder.map((rung) => (
                  <div
                    key={rung.level}
                    className={`flex items-start gap-3.5 rounded-[18px] px-4 py-3.5 ${
                      rung.reached ? "panel" : "quiet-panel"
                    }`}
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-[12px] font-display text-[14px] font-extrabold tabular ${
                        rung.reached
                          ? "bg-accent-quiet text-accent"
                          : "bg-elevated text-hint"
                      }`}
                    >
                      {rung.reached ? <CheckIcon size={16} /> : rung.level}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-display text-[14.5px] font-bold tracking-[-0.01em]">
                        {t("progression.rung", { level: rung.level })}
                        {rung.newTitle && (
                          <span className="rounded-full bg-accent-quiet px-2 py-0.5 font-display text-[9.5px] font-bold tracking-[0.01em] text-accent">
                            {t(`titles.${rung.title}`)}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 font-display text-[11px] font-bold tracking-[0.01em] text-hint tabular">
                        {rung.xpTotal.toLocaleString("en-US")} XP
                      </p>

                      {(rung.energyBonus > 0 || rung.coinBonus > 0 || rung.newTitle) && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          {rung.newTitle && (
                            <Perk
                              icon={<CrownIcon size={12} />}
                              label={t("progression.perkTitle", { title: t(`titles.${rung.title}`) })}
                            />
                          )}
                          {rung.energyBonus > 0 && (
                            <Perk
                              icon={<BoltIcon size={12} />}
                              label={t("progression.perkEnergy", { count: rung.energyBonus })}
                            />
                          )}
                          {rung.coinBonus > 0 && (
                            <Perk
                              icon={<CoinIcon size={12} />}
                              label={t("progression.perkCoins", { count: rung.coinBonus })}
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {!rung.reached && <LockIcon size={14} className="mt-1 shrink-0 text-hint/60" />}
                  </div>
                ))}
              </div>
            </m.section>
          </m.div>
        )}
      </div>
    </PushScreen>
  );
};
