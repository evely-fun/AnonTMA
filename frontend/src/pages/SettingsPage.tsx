import { useState } from "react";

import { NOISE_LEVELS, type NoiseLevel } from "@/features/voice/noise";
import { useBackButton } from "@/shared/hooks/useBackButton";
import { request } from "@/shared/lib/api";
import type { Profile } from "@/shared/lib/types";
import { Card, Chip, Screen, Section, Segmented, Switch } from "@/shared/ui";
import { useSession } from "@/store/session";
import { toast } from "@/store/ui";
import { useVoice } from "@/store/voice";

import styles from "./SettingsPage.module.css";

const LANGUAGES = [
  { value: "any", label: "Any" },
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
  { value: "uk", label: "Українська" },
  { value: "es", label: "Español" },
];

const GENDERS = [
  { value: "any", label: "Anyone" },
  { value: "male", label: "Men" },
  { value: "female", label: "Women" },
];

export const SettingsPage = () => {
  const profile = useSession((state) => state.profile);
  const patchProfile = useSession((state) => state.patchProfile);
  const setVoiceLevel = useVoice((state) => state.setLevel);
  const [saving, setSaving] = useState(false);

  useBackButton("/profile");

  if (!profile) {
    return <Screen title="Settings" />;
  }

  const preferences = profile.preferences;

  const update = async (patch: Record<string, unknown>): Promise<void> => {
    setSaving(true);
    try {
      const updated = await request<Profile>("/users/me", {
        method: "PATCH",
        body: { preferences: { ...preferences, ...patch } },
      });
      patchProfile(updated);
    } catch {
      toast("Could not save settings", { tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Settings" subtitle={saving ? "saving…" : undefined}>
      <Section title="Voice" subtitle="Noise processing runs locally on your device">
        <div className={styles.levelList}>
          {NOISE_LEVELS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={[
                styles.levelOption,
                preferences.noiseSuppression === option.value ? styles.levelActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                setVoiceLevel(option.value as NoiseLevel);
                void update({ noiseSuppression: option.value });
              }}
            >
              <span className={styles.levelName}>{option.label}</span>
              <span className={styles.levelHint}>{option.hint}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Matching">
        <Card>
          <div className={styles.field}>
            <span className={styles.label}>Language</span>
            <div className={styles.chipRow}>
              {LANGUAGES.map((item) => (
                <Chip
                  key={item.value}
                  active={preferences.matchLanguage === item.value}
                  onClick={() => void update({ matchLanguage: item.value })}
                >
                  {item.label}
                </Chip>
              ))}
            </div>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Show me</span>
            <div className={styles.chipRow}>
              {GENDERS.map((item) => (
                <Chip
                  key={item.value}
                  active={preferences.matchGender === item.value}
                  onClick={() => void update({ matchGender: item.value })}
                >
                  {item.label}
                </Chip>
              ))}
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Appearance">
        <Card>
          <Segmented
            id="theme"
            value={preferences.theme}
            onChange={(value) => void update({ theme: value })}
            options={[
              { value: "auto", label: "Auto" },
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
          />
        </Card>
      </Section>

      <Section title="Privacy and feedback">
        <Card>
          <div className={styles.toggleRow}>
            <div>
              <p className={styles.toggleTitle}>Allow calls from friends</p>
              <p className={styles.toggleHint}>Friends can ring you directly</p>
            </div>
            <Switch
              label="Allow calls from friends"
              checked={preferences.allowFriendCalls}
              onChange={(value) => void update({ allowFriendCalls: value })}
            />
          </div>
          <div className={styles.toggleRow}>
            <div>
              <p className={styles.toggleTitle}>Haptics</p>
              <p className={styles.toggleHint}>Vibration on taps and events</p>
            </div>
            <Switch
              label="Haptics"
              checked={preferences.haptics}
              onChange={(value) => void update({ haptics: value })}
            />
          </div>
          <div className={styles.toggleRow}>
            <div>
              <p className={styles.toggleTitle}>Sounds</p>
              <p className={styles.toggleHint}>Match and call tones</p>
            </div>
            <Switch
              label="Sounds"
              checked={preferences.sounds}
              onChange={(value) => void update({ sounds: value })}
            />
          </div>
        </Card>
      </Section>

      <Section title="About">
        <Card>
          <p className={styles.aboutText}>
            Your Telegram identity is never shown to strangers. Each conversation gives you a fresh
            mask, and messages are kept only for moderation of reported chats.
          </p>
          <p className={styles.aboutMeta}>Anon · version 1.0</p>
        </Card>
      </Section>
    </Screen>
  );
};
