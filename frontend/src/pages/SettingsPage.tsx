import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { VOICE_PRESETS, type VoicePreset } from "@/features/voice/changer";
import { NOISE_LEVELS, type NoiseLevel } from "@/features/voice/noise";
import { useBackButton } from "@/shared/hooks/useBackButton";
import { useT } from "@/shared/i18n";
import { request } from "@/shared/lib/api";
import { listStagger, rise, spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import { PALETTES, paletteSwatch, resolveScheme, type Palette, type ThemeMode } from "@/shared/lib/theme";
import type { Profile } from "@/shared/lib/types";
import {
  Button,
  Chip,
  IconTile,
  ListRow,
  OptionRow,
  Panel,
  PushScreen,
  ScreenHeader,
  SectionHead,
  Segmented,
  Sheet,
  Switch,
} from "@/shared/ui";
import { CheckIcon, LockIcon } from "@/shared/ui/icons";
import { CrownMark, GavelMark, PromoMark, SupportMark } from "@/shared/ui/marks";
import { useSession } from "@/store/session";
import { useShop } from "@/store/shop";
import { toast } from "@/store/ui";
import { useVoice } from "@/store/voice";

const LANGUAGES = [
  { value: "any", label: "Any" },
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
  { value: "uk", label: "Українська" },
  { value: "es", label: "Español" },
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
  const { t } = useT();
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const patchProfile = useSession((state) => state.patchProfile);
  const setVoiceLevel = useVoice((state) => state.setLevel);
  const setVoicePreset = useVoice((state) => state.setPreset);
  const [saving, setSaving] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [code, setCode] = useState("");
  const shopItems = useShop((store) => store.items);
  const loadShop = useShop((store) => store.load);

  useBackButton("/profile");

  useEffect(() => {
    void loadShop();
  }, [loadShop]);

  if (!profile) return null;
  const preferences = profile.preferences;
  const theme = (preferences.theme ?? "auto") as ThemeMode;
  const palette = (profile.palette ?? "auto") as Palette;
  const scheme = resolveScheme(theme);
  const premium = profile.premium?.active ?? false;
  const lockedPalettes = new Set(
    shopItems
      .filter((item) => item.category === "palette" && !item.owned)
      .map((item) => item.value),
  );

  const save = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const updated = await request<Profile>("/users/me", { method: "PATCH", body });
      patchProfile(updated);
    } catch {
      toast(t("settings.saveFailed"), { tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const redeem = async () => {
    setSaving(true);
    try {
      await request("/owner/redeem", { method: "POST", body: { code } });
      const updated = await request<Profile>("/users/me");
      patchProfile(updated);
      haptic.notify("success");
      toast(t("notices.promoTitle"), { tone: "success" });
      setRedeeming(false);
    } catch {
      haptic.notify("error");
      toast(t("owner.redeemFailed"), { tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Record<string, unknown>) =>
    save({ preferences: { ...preferences, ...patch } });

  const choosePreset = (value: VoicePreset) => {
    if (!premium && value !== "natural") {
      haptic.notify("warning");
      navigate("/premium");
      return;
    }
    haptic.select();
    setVoicePreset(value);
    void update({ voicePreset: value });
  };

  return (
    <PushScreen>
      <ScreenHeader
        title={t("settings.title")}
        subtitle={saving ? t("settings.saving") : t("settings.subtitle")}
        onBack={() => navigate("/profile")}
      />

      <m.div
        className="flex-1 space-y-7 overflow-y-auto pb-[calc(28px+env(safe-area-inset-bottom))] pt-4"
        variants={listStagger}
        initial="initial"
        animate="animate"
      >
        <m.section variants={rise}>
          <SectionHead title={t("settings.appearance")} />
          <div className="space-y-4 px-4">
            <Segmented
              id="theme"
              value={theme}
              onChange={(value) => void update({ theme: value })}
              options={[
                { value: "auto" as ThemeMode, label: t("settings.auto") },
                { value: "light" as ThemeMode, label: t("settings.light") },
                { value: "dark" as ThemeMode, label: t("settings.dark") },
              ]}
            />

            <div>
              <p className="mb-2.5 font-display text-[11px] font-bold tracking-[0.01em] text-hint">
                {t("settings.palette")}
              </p>
              <div className="grid grid-cols-4 gap-2.5">
                {PALETTES.map((item) => {
                  const swatch = paletteSwatch(item, scheme);
                  const active = palette === item;
                  const locked = lockedPalettes.has(item);
                  return (
                    <m.button
                      key={item}
                      type="button"
                      onPointerDown={() => haptic.select()}
                      onClick={() => {
                        if (locked) {
                          navigate("/shop");
                          return;
                        }
                        void save({ palette: item });
                      }}
                      whileTap={{ scale: 0.94 }}
                      transition={spring.snappy}
                      className="flex flex-col items-center gap-1.5"
                    >
                      {/* A palette is a scheme, not a colour, so the swatch is
                          a tiny screen: the ground it paints with an accent bar
                          sitting on it. Two abstract discs said nothing about
                          what choosing it would actually look like. */}
                      <span
                        className={`relative flex aspect-[4/5] w-full flex-col justify-end gap-1 overflow-hidden rounded-[12px] p-1.5 transition-[box-shadow] duration-200 ${
                          active
                            ? "shadow-[0_0_0_2px_var(--color-accent)]"
                            : "shadow-[0_0_0_1px_var(--color-separator)]"
                        }`}
                        style={{ background: swatch.ground }}
                      >
                        <span
                          className="block h-1.5 w-full rounded-full"
                          style={{ background: swatch.accent, opacity: 0.35 }}
                        />
                        <span
                          className="block h-2.5 w-full rounded-full"
                          style={{ background: swatch.accent }}
                        />
                        {active && !locked && (
                          <m.span
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={spring.snappy}
                            className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-accent text-on-accent"
                          >
                            <CheckIcon size={10} />
                          </m.span>
                        )}
                        {/* The lock is a badge, not a shade over the whole
                            swatch: you should be able to see what you would be
                            buying before you decide to buy it. */}
                        {locked && (
                          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-[oklch(0_0_0/0.4)] text-[oklch(1_0_0/0.92)]">
                            <LockIcon size={10} />
                          </span>
                        )}
                      </span>
                      <span
                        className={`text-[10.5px] font-semibold ${
                          locked ? "text-hint/70" : active ? "text-label" : "text-hint"
                        }`}
                      >
                        {t(`palettes.${item}`)}
                      </span>
                    </m.button>
                  );
                })}
              </div>
              <p className="mt-2.5 text-[12px] text-hint">{t("settings.paletteHint")}</p>
            </div>

            <div>
              <p className="mb-2 text-[12.5px] font-semibold text-secondary">
                {t("settings.interfaceLanguage")}
              </p>
              <Segmented
                id="ui-language"
                value={(profile.uiLanguage ?? "auto") as "auto" | "en" | "ru"}
                onChange={(value) => void save({ uiLanguage: value })}
                options={[
                  { value: "auto" as const, label: t("settings.auto") },
                  { value: "en" as const, label: "English" },
                  { value: "ru" as const, label: "Русский" },
                ]}
              />
            </div>
          </div>
        </m.section>

        <m.section variants={rise}>
          <SectionHead title={t("settings.noise")} note={t("settings.noiseHint")} />
          <Panel divided>
            {NOISE_LEVELS.map((value) => (
              <OptionRow
                key={value}
                grouped
                title={t(`voice.noise.${value}.name`)}
                subtitle={t(`voice.noise.${value}.hint`)}
                active={preferences.noiseSuppression === value}
                onClick={() => {
                  haptic.select();
                  setVoiceLevel(value as NoiseLevel);
                  void update({ noiseSuppression: value });
                }}
              />
            ))}
          </Panel>
        </m.section>

        <m.section variants={rise}>
          <SectionHead
            title={t("voice.changer")}
            note={premium ? t("voice.changerHint") : t("voice.premiumOnly")}
            trailing={
              premium ? undefined : (
                <button
                  type="button"
                  onClick={() => navigate("/premium")}
                  className="flex items-center gap-1.5 font-display text-[13px] font-bold text-accent"
                >
                  <CrownMark size={15} />
                  {t("common.premium")}
                </button>
              )
            }
          />
          <div className="grid grid-cols-3 gap-2 px-4">
            {VOICE_PRESETS.map((value) => {
              const locked = !premium && value !== "natural";
              const active = (preferences.voicePreset ?? "natural") === value;
              return (
                <m.button
                  key={value}
                  type="button"
                  onClick={() => choosePreset(value as VoicePreset)}
                  whileTap={{ scale: 0.95 }}
                  transition={spring.snappy}
                  className={`flex flex-col items-start gap-1 rounded-[14px] px-3 py-2.5 text-left ${
                    active ? "bg-accent-quiet" : "panel"
                  } ${locked ? "opacity-55" : ""}`}
                >
                  <span className="flex w-full items-center justify-between gap-1">
                    <span
                      className={`truncate font-display text-[12.5px] font-bold ${
                        active ? "text-accent" : "text-label"
                      }`}
                    >
                      {t(`voice.presets.${value}.name`)}
                    </span>
                    {locked && <LockIcon size={12} className="shrink-0 text-hint" />}
                  </span>
                </m.button>
              );
            })}
          </div>
        </m.section>

        <m.section variants={rise}>
          <SectionHead title={t("settings.matching")} />
          <div className="space-y-4 px-4">
            <div>
              <p className="mb-2 text-[12.5px] font-semibold text-secondary">
                {t("settings.language")}
              </p>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((item) => (
                  <Chip
                    key={item.value}
                    active={preferences.matchLanguage === item.value}
                    onClick={() => void update({ matchLanguage: item.value })}
                  >
                    {item.value === "any" ? t("settings.anyone") : item.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[12.5px] font-semibold text-secondary">
                {t("settings.showMe")}
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "any", label: t("settings.anyone") },
                  { value: "male", label: t("settings.men") },
                  { value: "female", label: t("settings.women") },
                ].map((item) => (
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
        </m.section>

        <m.section variants={rise}>
          <SectionHead title={t("settings.privacy")} />
          <Panel divided>
            <Toggle
              title={t("settings.callsFromFriends")}
              hint={t("settings.callsHint")}
              checked={preferences.allowFriendCalls}
              onChange={(value) => void update({ allowFriendCalls: value })}
            />
            <Toggle
              title={t("settings.haptics")}
              hint={t("settings.hapticsHint")}
              checked={preferences.haptics}
              onChange={(value) => void update({ haptics: value })}
            />
            <Toggle
              title={t("settings.sounds")}
              hint={t("settings.soundsHint")}
              checked={preferences.sounds}
              onChange={(value) => void update({ sounds: value })}
            />
          </Panel>
        </m.section>

        {/* The owner's switch. It is only rendered for the account that can
            actually set it, and the server refuses it for anyone else, so this
            is a courtesy rather than the check. */}
        {profile.rights?.includes("owner.announce") && (
          <m.section variants={rise}>
            <SectionHead title={t("settings.owner")} />
            <Panel>
              <Toggle
                title={t("settings.announceEntrance")}
                hint={t("settings.announceEntranceHint")}
                checked={Boolean(preferences.announceEntrance)}
                onChange={(value) => void update({ announceEntrance: value })}
              />
            </Panel>
          </m.section>
        )}

        <m.section variants={rise}>
          <SectionHead title={t("support.title")} note={t("support.subtitle")} />
          <Panel>
            <ListRow
              leading={<IconTile tone="accent"><SupportMark size={20} /></IconTile>}
              title={t("support.newTicket")}
              subtitle={t("support.settingsHint")}
              chevron
              onClick={() => navigate("/support")}
            />
            <ListRow
              leading={<IconTile tone="warn"><PromoMark size={20} /></IconTile>}
              title={t("owner.redeem")}
              subtitle={t("owner.redeemHint")}
              chevron
              onClick={() => {
                setCode("");
                setRedeeming(true);
              }}
            />
            {profile.rights?.includes("owner.panel") && (
              <ListRow
                leading={<IconTile tone="danger"><GavelMark size={20} /></IconTile>}
                title={t("owner.open")}
                subtitle={t("owner.openHint")}
                chevron
                onClick={() => navigate("/owner")}
              />
            )}
          </Panel>
        </m.section>

        <m.section className="px-4" variants={rise}>
          <p className="text-[12.5px] leading-relaxed text-hint">{t("settings.about")}</p>
        </m.section>
      </m.div>

      <Sheet
        open={redeeming}
        onClose={() => setRedeeming(false)}
        title={t("owner.redeem")}
        description={t("owner.redeemHint")}
      >
        <div className="flex flex-col gap-3 pb-2">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder={t("owner.redeemPlaceholder")}
            maxLength={24}
            className="w-full rounded-[16px] bg-elevated px-4 py-3 text-center font-display text-[18px] font-extrabold tracking-[0.14em] tabular outline-none placeholder:tracking-normal placeholder:text-hint"
          />
          <Button full loading={saving} disabled={code.length < 4} onClick={() => void redeem()}>
            {t("owner.redeemGo")}
          </Button>
        </div>
      </Sheet>
    </PushScreen>
  );
};
