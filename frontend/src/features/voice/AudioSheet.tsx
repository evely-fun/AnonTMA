import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { VOICE_PRESETS, type VoicePreset } from "@/features/voice/changer";
import { NOISE_LEVELS, type NoiseLevel } from "@/features/voice/noise";
import { useT } from "@/shared/i18n";
import { request } from "@/shared/lib/api";
import { haptic } from "@/shared/lib/telegram";
import type { Profile } from "@/shared/lib/types";
import { Button, OptionRow, Segmented, Sheet } from "@/shared/ui";
import { CrownIcon, LockIcon } from "@/shared/ui/icons";
import { useSession } from "@/store/session";
import { useVoice } from "@/store/voice";

export const AudioSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useT();
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const patchProfile = useSession((state) => state.patchProfile);
  const level = useVoice((state) => state.level);
  const preset = useVoice((state) => state.preset);
  const setLevel = useVoice((state) => state.setLevel);
  const setPreset = useVoice((state) => state.setPreset);
  const [tab, setTab] = useState<"noise" | "voice">("noise");

  const premium = profile?.premium?.active ?? false;

  const persist = (patch: Record<string, unknown>) => {
    const preferences = profile?.preferences;
    if (!preferences) return;
    void request<Profile>("/users/me", {
      method: "PATCH",
      body: { preferences: { ...preferences, ...patch } },
    })
      .then(patchProfile)
      .catch(() => undefined);
  };

  const chooseLevel = (value: NoiseLevel) => {
    haptic.select();
    setLevel(value);
    persist({ noiseSuppression: value });
  };

  const choosePreset = (value: VoicePreset) => {
    if (!premium && value !== "natural") {
      haptic.notify("warning");
      return;
    }
    haptic.select();
    setPreset(value);
    persist({ voicePreset: value });
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("chat.audioSettings")}>
      <div className="pb-1">
        <Segmented
          id="audio-sheet"
          value={tab}
          onChange={setTab}
          options={[
            { value: "noise", label: t("settings.noise") },
            { value: "voice", label: t("voice.changer") },
          ]}
        />
      </div>

      {tab === "noise" ? (
        <div className="flex flex-col gap-2 pt-3 pb-2">
          <p className="px-1 pb-1 text-[12.5px] leading-snug text-hint">{t("settings.noiseHint")}</p>
          {NOISE_LEVELS.map((value) => (
            <OptionRow
              key={value}
              title={t(`voice.noise.${value}.name`)}
              subtitle={t(`voice.noise.${value}.hint`)}
              active={level === value}
              onClick={() => chooseLevel(value)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2 pt-3 pb-2">
          <p className="px-1 pb-1 text-[12.5px] leading-snug text-hint">{t("voice.changerHint")}</p>
          {!premium && (
            <div className="mb-1 flex items-center gap-3 rounded-[16px] bg-accent-quiet px-4 py-3">
              <CrownIcon size={18} className="shrink-0 text-accent" />
              <p className="flex-1 text-[12.5px] leading-snug text-secondary">
                {t("voice.premiumOnly")}
              </p>
              <Button
                size="sm"
                onClick={() => {
                  onClose();
                  navigate("/premium");
                }}
              >
                {t("common.premium")}
              </Button>
            </div>
          )}
          {VOICE_PRESETS.map((value) => {
            const locked = !premium && value !== "natural";
            return (
              <OptionRow
                key={value}
                title={t(`voice.presets.${value}.name`)}
                subtitle={t(`voice.presets.${value}.hint`)}
                active={preset === value}
                muted={locked}
                trailing={locked ? <LockIcon size={15} className="text-hint" /> : undefined}
                onClick={() => choosePreset(value)}
              />
            );
          })}
        </div>
      )}
    </Sheet>
  );
};
