import { AnimatePresence, m } from "motion/react";
import { useState } from "react";

import { request } from "@/shared/lib/api";
import { ease, pop } from "@/shared/lib/motion";
import type { Profile } from "@/shared/lib/types";
import { Avatar, Button, Chip, LevelBars, Meter } from "@/shared/ui";
import { MaskIcon, MicIcon, ShieldIcon } from "@/shared/ui/icons";
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
      toast("Saved locally, you can change this later", { tone: "danger" });
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
        {[0, 1, 2].map((index) => (
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
            key="welcome"
            className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
            variants={pop}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <span className="flex size-[110px] items-center justify-center rounded-[34px] bg-elevated text-accent shadow-[inset_0_1px_0_oklch(1_0_0/0.14)]">
              <MaskIcon size={52} />
            </span>
            <h1 className="mt-2 font-display text-[27px] font-extrabold leading-tight tracking-[-0.03em]">
              Talk to people
              <br />
              behind a mask
            </h1>
            <p className="max-w-[300px] text-[14px] leading-snug text-secondary">
              Every conversation gives you a new name and a new face. Nothing links back to your
              Telegram account unless you both choose to reveal.
            </p>
            <Button full size="lg" className="mt-4" onClick={() => setStep(1)}>
              Get started
            </Button>
          </m.div>
        )}

        {step === 1 && (
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
              {profile?.anonName ?? "Anonymous"}
            </h1>
            <p className="max-w-[290px] text-[14px] leading-snug text-secondary">
              This is your public mask. Roll it until it feels right, you can change it any time.
            </p>
            <div className="mt-4 flex w-full gap-2">
              <Button full variant="surface" onClick={() => void regenerate()}>
                Roll again
              </Button>
              <Button full onClick={() => setStep(2)}>
                Keep it
              </Button>
            </div>
          </m.div>
        )}

        {step === 2 && (
          <m.div
            key="interests"
            className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
            variants={pop}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <h1 className="font-display text-[24px] font-extrabold tracking-[-0.03em]">
              What do you like talking about?
            </h1>
            <p className="text-[13.5px] text-hint">Used only to find a better companion</p>

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
                  {item}
                </Chip>
              ))}
            </div>

            <div className="panel mt-4 w-full rounded-[20px] px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-live-quiet text-live">
                  <MicIcon size={19} />
                </span>
                <div className="min-w-0 flex-1 text-left">
                  <p className="font-display text-[14px] font-bold">Microphone</p>
                  <p className="text-[11.5px] text-hint">
                    {permission === "granted" ? "Say something, the bars move" : "Needed for voice"}
                  </p>
                </div>
                {permission !== "granted" && (
                  <Button size="sm" variant="surface" onClick={() => void enableVoice()}>
                    Allow
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

            <Button full size="lg" loading={busy} className="mt-2" onClick={() => void finish()}>
              Enter Anon
            </Button>
            <p className="flex items-center gap-1.5 text-[11.5px] text-hint">
              <ShieldIcon size={12} />
              You can change everything later in settings
            </p>
          </m.div>
        )}
      </AnimatePresence>
    </m.main>
  );
};
