import { AnimatePresence, m } from "motion/react";
import { useState } from "react";

import { useI18n, useT } from "@/shared/i18n";
import { request } from "@/shared/lib/api";
import { ease, pop } from "@/shared/lib/motion";
import type { Profile } from "@/shared/lib/types";
import { Avatar, Button, Chip, LevelBars, Meter, tileArt } from "@/shared/ui";
import {
  BoltIcon,
  CoinIcon,
  CrownIcon,
  MicIcon,
  ShieldIcon,
} from "@/shared/ui/icons";
import { useSession } from "@/store/session";
import { toast } from "@/store/ui";
import { useVoice } from "@/store/voice";

const INTERESTS = [
  "music",
  "films",
  "games",
  "travel",
  "sport",
  "books",
  "tech",
  "art",
  "food",
  "science",
  "memes",
  "night talks",
];

export const OnboardingPage = () => {
  const { t, locale } = useT();
  const setLocale = useI18n((state) => state.setPreference);
  const profile = useSession((state) => state.profile);
  const patchProfile = useSession((state) => state.patchProfile);
  const micLevel = useVoice((state) => state.micLevel);
  const enableVoice = useVoice((state) => state.enable);
  const permission = useVoice((state) => state.permission);
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const regenerate = async () => {
    const updated = await request<Profile>("/users/me", {
      method: "PATCH",
      body: { regenerateMask: true },
    });
    patchProfile(updated);
  };

  const finish = async () => {
    setBusy(true);
    try {
      const updated = await request<Profile>("/users/me", {
        method: "PATCH",
        body: { interests: interests.length > 0 ? interests : ["night talks"] },
      });
      patchProfile(updated);
    } catch {
      toast(t("errors.generic"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <m.main
      className="flex h-full flex-col items-center gap-6 px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(28px+env(safe-area-inset-top))]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: ease.out }}
    >
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4].map((index) => (
          <span
            key={index}
            className={`h-1 w-6 rounded-full transition-colors duration-300 ${
              index <= step ? "bg-accent" : "bg-bezel"
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <m.div
            key="language"
            className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
            variants={pop}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <img
              src={tileArt("language").src}
              alt=""
              className="size-[112px] rounded-[30px] object-cover"
            />
            <h1 className="mt-1 font-display text-[24px] font-extrabold tracking-[-0.03em]">
              {t("onboarding.languageTitle")}
            </h1>
            <p className="max-w-[280px] text-[13.5px] leading-snug text-hint">
              {t("onboarding.languageHint")}
            </p>
            <div className="mt-3 flex w-full max-w-[300px] flex-col gap-2">
              {[
                { value: "en" as const, label: "English" },
                { value: "ru" as const, label: "Русский" },
              ].map((option) => (
                <Button
                  key={option.value}
                  full
                  size="lg"
                  variant={locale === option.value ? "primary" : "surface"}
                  onClick={() => {
                    setLocale(option.value);
                    void request("/users/me", {
                      method: "PATCH",
                      body: { uiLanguage: option.value },
                    }).catch(() => undefined);
                    setStep(1);
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </m.div>
        )}

        {step === 1 && (
          <m.div
            key="welcome"
            className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
            variants={pop}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <img
              src={tileArt("mask").src}
              alt=""
              className="size-[132px] rounded-[36px] object-cover"
            />
            <h1 className="mt-2 font-display text-[27px] font-extrabold leading-tight tracking-[-0.03em]">
              {t("onboarding.title")}
            </h1>
            <p className="max-w-[300px] text-[14px] leading-snug text-secondary">
              {t("onboarding.body")}
            </p>
            <Button full size="lg" className="mt-4" onClick={() => setStep(2)}>
              {t("onboarding.getStarted")}
            </Button>
          </m.div>
        )}

        {step === 2 && (
          <m.div
            key="mask"
            className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
            variants={pop}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Avatar seed={profile?.avatarSeed ?? "anon"} size={118} />
            <h1 className="mt-2 font-display text-[24px] font-extrabold tracking-[-0.03em]">
              {profile?.anonName ?? t("chat.stranger")}
            </h1>
            <p className="max-w-[290px] text-[14px] leading-snug text-secondary">
              {t("onboarding.maskBody")}
            </p>
            <div className="mt-4 flex w-full gap-2">
              <Button full variant="surface" onClick={() => void regenerate()}>
                {t("onboarding.rollAgain")}
              </Button>
              <Button full onClick={() => setStep(3)}>
                {t("onboarding.keepIt")}
              </Button>
            </div>
          </m.div>
        )}

        {step === 3 && (
          <m.div
            key="interests"
            className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
            variants={pop}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <h1 className="font-display text-[24px] font-extrabold tracking-[-0.03em]">
              {t("onboarding.interestsTitle")}
            </h1>
            <p className="text-[13.5px] text-hint">{t("onboarding.interestsHint")}</p>

            <div className="flex flex-wrap justify-center gap-2">
              {INTERESTS.map((item) => (
                <Chip
                  key={item}
                  active={interests.includes(item)}
                  onClick={() =>
                    setInterests((current) =>
                      current.includes(item)
                        ? current.filter((entry) => entry !== item)
                        : [...current, item].slice(0, 8),
                    )
                  }
                >
                  {t(`interests.${item}`)}
                </Chip>
              ))}
            </div>

            <div className="panel mt-4 w-full rounded-[20px] px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-live-quiet text-live">
                  <MicIcon size={19} />
                </span>
                <div className="min-w-0 flex-1 text-left">
                  <p className="font-display text-[14px] font-bold">{t("onboarding.microphone")}</p>
                  <p className="text-[11.5px] text-hint">
                    {permission === "granted" ? t("onboarding.micGranted") : t("onboarding.micNeeded")}
                  </p>
                </div>
                {permission !== "granted" && (
                  <Button size="sm" variant="surface" onClick={() => void enableVoice()}>
                    {t("onboarding.allow")}
                  </Button>
                )}
              </div>
              {permission === "granted" ? (
                <div className="mt-3">
                  <LevelBars level={micLevel} bars={20} />
                </div>
              ) : (
                <div className="mt-3">
                  <Meter ratio={0} tone="live" />
                </div>
              )}
            </div>

            <Button full size="lg" className="mt-2" onClick={() => setStep(4)}>
              {t("common.next")}
            </Button>
          </m.div>
        )}

        {step === 4 && (
          <m.div
            key="economy"
            className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
            variants={pop}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <h1 className="font-display text-[23px] font-extrabold tracking-[-0.03em]">
              {t("onboarding.economyTitle")}
            </h1>

            <div className="mt-2 flex w-full flex-col gap-2 text-left">
              {[
                {
                  icon: <BoltIcon size={19} />,
                  tone: "bg-warn/15 text-warn",
                  title: t("onboarding.energyWhat"),
                  body: t("onboarding.energyBody", { voice: 8, text: 4 }),
                },
                {
                  icon: <CoinIcon size={19} />,
                  tone: "bg-live-quiet text-live",
                  title: t("onboarding.coinsWhat"),
                  body: t("onboarding.coinsBody"),
                },
                {
                  icon: <CrownIcon size={19} />,
                  tone: "bg-accent-quiet text-accent",
                  title: t("onboarding.premiumWhat"),
                  body: t("onboarding.premiumBody"),
                },
              ].map((row) => (
                <div key={row.title} className="panel flex gap-3 rounded-[18px] px-4 py-3.5">
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-[13px] ${row.tone}`}
                  >
                    {row.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-[14.5px] font-bold tracking-[-0.01em]">
                      {row.title}
                    </p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-hint">{row.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <Button full size="lg" loading={busy} className="mt-3" onClick={() => void finish()}>
              {t("onboarding.enter")}
            </Button>
            <p className="flex items-center gap-1.5 text-[11.5px] text-hint">
              <ShieldIcon size={12} />
              {t("onboarding.changeLater")}
            </p>
          </m.div>
        )}
      </AnimatePresence>
    </m.main>
  );
};
