import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { voicePipeline } from "@/features/voice/noise";
import { request } from "@/shared/lib/api";
import { popVariants } from "@/shared/lib/motion";
import type { Profile } from "@/shared/lib/types";
import { Avatar, Button, Card, Chip, VoiceOrb } from "@/shared/ui";
import { useSession } from "@/store/session";
import { toast } from "@/store/ui";
import { useVoice } from "@/store/voice";

import styles from "./OnboardingPage.module.css";

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

  const regenerate = async (): Promise<void> => {
    const updated = await request<Profile>("/users/me", {
      method: "PATCH",
      body: { regenerateMask: true },
    });
    patchProfile(updated);
  };

  const finish = async (): Promise<void> => {
    setBusy(true);
    try {
      const updated = await request<Profile>("/users/me", {
        method: "PATCH",
        body: { interests: interests.length > 0 ? interests : ["night talks"] },
      });
      patchProfile(updated);
    } catch {
      toast("Could not save, you can change this later", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const testMic = async (): Promise<void> => {
    const granted = await enableVoice();
    if (!granted) {
      toast("Microphone is blocked, you can still use text chat", { tone: "danger" });
      return;
    }
    await voicePipeline.start(useVoice.getState().level).catch(() => undefined);
  };

  return (
    <main className={styles.screen}>
      <div className={styles.progress}>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={[styles.dot, index <= step ? styles.dotActive : ""].filter(Boolean).join(" ")}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 0 ? (
          <motion.div
            key="welcome"
            className={styles.stage}
            variants={popVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <VoiceOrb level={0.25} tone="brand" size={190}>
              🎭
            </VoiceOrb>
            <h1 className={styles.title}>
              Meet people <span className="gradient-text">behind a mask</span>
            </h1>
            <p className={styles.text}>
              Every conversation gives you a new name and a new face. Nothing is linked back to your
              Telegram account unless you both choose to reveal.
            </p>
            <Button full size="lg" onClick={() => setStep(1)}>
              Let us start
            </Button>
          </motion.div>
        ) : null}

        {step === 1 ? (
          <motion.div
            key="mask"
            className={styles.stage}
            variants={popVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Avatar seed={profile?.avatarSeed ?? "anon"} size={120} />
            <h1 className={styles.title}>{profile?.anonName ?? "Anonymous"}</h1>
            <p className={styles.text}>
              This is your public mask. Roll it until it feels right, you can change it any time.
            </p>
            <div className={styles.row}>
              <Button variant="secondary" onClick={() => void regenerate()}>
                Roll again
              </Button>
              <Button onClick={() => setStep(2)}>Keep it</Button>
            </div>
          </motion.div>
        ) : null}

        {step === 2 ? (
          <motion.div
            key="interests"
            className={styles.stage}
            variants={popVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <h1 className={styles.title}>What do you like talking about?</h1>
            <p className={styles.text}>We use this only to find a better companion for you.</p>
            <div className={styles.chips}>
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

            <Card className={styles.micCard}>
              <div className={styles.micRow}>
                <span className={styles.micIcon}>🎙</span>
                <div className={styles.micBody}>
                  <p className={styles.micTitle}>Test your microphone</p>
                  <p className={styles.micHint}>
                    {permission === "granted"
                      ? "Say something, the bar should move"
                      : "Needed for voice chats and voice games"}
                  </p>
                  <div className={styles.micTrack}>
                    <span className={styles.micFill} style={{ width: `${Math.min(100, micLevel * 130)}%` }} />
                  </div>
                </div>
                {permission !== "granted" ? (
                  <Button size="sm" variant="secondary" onClick={() => void testMic()}>
                    Allow
                  </Button>
                ) : null}
              </div>
            </Card>

            <Button full size="lg" loading={busy} onClick={() => void finish()}>
              Enter Anon
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
};
