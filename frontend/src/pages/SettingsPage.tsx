import { useState } from "react";

import { NOISE_LEVELS, type NoiseLevel } from "@/features/voice/noise";
import { useBackButton } from "@/shared/hooks/useBackButton";
import { request } from "@/shared/lib/api";
import { haptic } from "@/shared/lib/telegram";
import type { Profile } from "@/shared/lib/types";
import { Chip, Panel, ScreenHeader, SectionHead, Segmented, Switch } from "@/shared/ui";
import { CheckIcon } from "@/shared/ui/icons";
import { useSession } from "@/store/session";
import { toast } from "@/store/ui";
import { useVoice } from "@/store/voice";

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

const Toggle = ({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <div className="flex items-center justify-between gap-4 px-4 py-3.5">
    <div className="min-w-0">
      <p className="font-display text-[14.5px] font-bold tracking-[-0.01em]">{title}</p>
      <p className="mt-0.5 text-[12px] text-hint">{hint}</p>
    </div>
    <Switch label={title} checked={checked} onChange={onChange} />
  </div>
);

export const SettingsPage = () => {
  const profile = useSession((state) => state.profile);
  const patchProfile = useSession((state) => state.patchProfile);
  const setVoiceLevel = useVoice((state) => state.setLevel);
  const [saving, setSaving] = useState(false);

  useBackButton("/profile");

  if (!profile) return null;
  const preferences = profile.preferences;

  const update = async (patch: Record<string, unknown>) => {
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
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Settings"
        subtitle={saving ? "saving…" : "voice, matching, privacy"}
        onBack={() => history.back()}
      />

      <div className="flex-1 space-y-7 overflow-y-auto pb-[calc(24px+env(safe-area-inset-bottom))] pt-4">
        <section>
          <SectionHead title="Noise suppression" note="Runs on your device, nothing is uploaded" />
          <div className="space-y-2 px-4">
            {NOISE_LEVELS.map((option) => {
              const active = preferences.noiseSuppression === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    haptic.select();
                    setVoiceLevel(option.value as NoiseLevel);
                    void update({ noiseSuppression: option.value });
                  }}
                  className={`flex w-full items-center gap-3 rounded-[16px] px-4 py-3.5 text-left transition-colors ${
                    active ? "bg-accent-quiet" : "panel"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block font-display text-[14.5px] font-bold ${
                        active ? "text-accent" : "text-label"
                      }`}
                    >
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-hint">{option.hint}</span>
                  </span>
                  {active && (
                    <span className="text-accent">
                      <CheckIcon size={17} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <SectionHead title="Matching" />
          <div className="space-y-4 px-4">
            <div>
              <p className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.12em] text-hint">
                Language
              </p>
              <div className="flex flex-wrap gap-2">
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
            <div>
              <p className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.12em] text-hint">
                Show me
              </p>
              <div className="flex flex-wrap gap-2">
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
          </div>
        </section>

        <section>
          <SectionHead title="Appearance" />
          <div className="px-4">
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
          </div>
        </section>

        <section>
          <SectionHead title="Privacy" />
          <Panel divided>
            <Toggle
              title="Calls from friends"
              hint="Friends can ring you directly"
              checked={preferences.allowFriendCalls}
              onChange={(value) => void update({ allowFriendCalls: value })}
            />
            <Toggle
              title="Haptics"
              hint="Vibration on taps and events"
              checked={preferences.haptics}
              onChange={(value) => void update({ haptics: value })}
            />
            <Toggle
              title="Sounds"
              hint="Match and call tones"
              checked={preferences.sounds}
              onChange={(value) => void update({ sounds: value })}
            />
          </Panel>
        </section>

        <section className="px-4">
          <p className="text-[12.5px] leading-relaxed text-hint">
            Your Telegram name, photo and username are never shown to strangers. Each conversation
            issues a fresh mask, and messages are stored only for moderation of reported chats.
          </p>
        </section>
      </div>
    </div>
  );
};
