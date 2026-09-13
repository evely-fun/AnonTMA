import { m } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useBackButton } from "@/shared/hooks/useBackButton";
import { useT } from "@/shared/i18n";
import { backgroundClass, nameEffectClass } from "@/shared/lib/cosmetics";
import { listStagger, rise, spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import { request } from "@/shared/lib/api";
import type { Profile, ShopItem } from "@/shared/lib/types";
import { Avatar, Button, PushScreen, Rail, ScreenHeader, Skeleton } from "@/shared/ui";
import { CheckIcon, LockIcon } from "@/shared/ui/icons";
import { useSession } from "@/store/session";
import { useShop } from "@/store/shop";
import { toast } from "@/store/ui";

type Slot = "avatar" | "frame" | "effect" | "background";

const SLOTS: Slot[] = ["avatar", "frame", "effect", "background"];

/** A ring of hues wide enough that any two picks read as different people. */
const HUES = [28, 62, 128, 168, 210, 250, 292, 330];

export const WardrobePage = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const refreshProfile = useSession((state) => state.refreshProfile);
  const patchProfile = useSession((state) => state.patchProfile);
  const items = useShop((store) => store.items);
  const equipped = useShop((store) => store.equipped);
  const load = useShop((store) => store.load);
  const equip = useShop((store) => store.equip);

  // The preview follows the tap immediately, the request catches up after.
  const [draft, setDraft] = useState<Record<Slot, string> | null>(null);
  const nameHue = profile?.preferences?.nameHue ?? 28;

  const chooseHue = async (hue: number) => {
    haptic.select();
    // Painted on the spot so the mirror answers the tap, then saved.
    document.documentElement.style.setProperty("--name-hue", String(hue));
    try {
      const updated = await request<Profile>("/users/me", {
        method: "PATCH",
        body: { preferences: { ...profile?.preferences, nameHue: hue } },
      });
      patchProfile(updated);
    } catch {
      toast(t("errors.generic"), { tone: "danger" });
    }
  };

  useBackButton("/profile");

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDraft({
      avatar: equipped.avatar,
      frame: equipped.frame,
      effect: equipped.effect,
      background: equipped.background,
    });
  }, [equipped.avatar, equipped.frame, equipped.effect, equipped.background]);

  const worn = draft ?? {
    avatar: equipped.avatar,
    frame: equipped.frame,
    effect: equipped.effect,
    background: equipped.background,
  };

  const shelves = useMemo(
    () =>
      SLOTS.map((slot) => ({
        slot,
        items: items.filter((item) => item.category === slot),
      })),
    [items],
  );

  const wear = async (slot: Slot, item: ShopItem) => {
    if (!item.owned) {
      haptic.notify("warning");
      navigate("/shop");
      return;
    }
    haptic.select();
    setDraft((current) => (current ? { ...current, [slot]: item.value } : current));
    const ok = await equip(item.key);
    if (!ok) {
      toast(t("errors.generic"), { tone: "danger" });
      setDraft((current) => (current ? { ...current, [slot]: equipped[slot] } : current));
      return;
    }
    void refreshProfile();
  };

  if (!profile) {
    return (
      <PushScreen>
        <ScreenHeader title={t("wardrobe.title")} onBack={() => navigate("/profile")} />
        <div className="space-y-3 px-4 pt-4">
          <Skeleton className="h-[240px]" />
          <Skeleton className="h-[90px]" />
        </div>
      </PushScreen>
    );
  }

  return (
    <PushScreen>
      <ScreenHeader
        title={t("wardrobe.title")}
        subtitle={t("wardrobe.subtitle")}
        onBack={() => navigate("/profile")}
      />

      <div className="flex-1 overflow-y-auto pb-[calc(28px+env(safe-area-inset-bottom))]">
        {/* A fitting room rather than a form: you stand in the mirror at the
            top, the rails run underneath, and nothing has to be switched on
            before it can be seen. */}
        <div className="sticky top-0 z-10 bg-bg px-4 pb-3 pt-3">
          <div
            className={`flex items-center gap-4 rounded-[26px] px-5 py-4 ${
              backgroundClass(worn.background) || "panel"
            }`}
          >
            {/* The mirror stays in view while you browse the rails, so it is
                laid out sideways: tall enough to judge a frame, short enough
                that the shelves are not pushed off the screen. */}
            <Avatar
              seed={profile.avatarSeed}
              style={worn.avatar}
              frame={worn.frame}
              gender={profile.gender}
              size={76}
            />
            <p
              className={`min-w-0 flex-1 font-display text-[19px] font-extrabold leading-tight tracking-[-0.025em] ${nameEffectClass(
                worn.effect,
              )}`}
            >
              {profile.anonName}
            </p>
          </div>
        </div>

        <m.div variants={listStagger} initial="initial" animate="animate" className="space-y-6">
          {shelves.map(({ slot, items: shelf }) => (
            <m.section key={slot} variants={rise}>
              <div className="flex items-baseline justify-between px-5 pb-2.5">
                <h2 className="font-display text-[15px] font-bold">
                  {t(`wardrobe.slots.${slot}`)}
                </h2>
                <span className="text-[12px] text-hint tabular">
                  {shelf.filter((item) => item.owned).length}/{shelf.length}
                </span>
              </div>

              {/* Picking the effect is half the choice. The colour it runs on
                  is the other half, and without it three people wearing the
                  same effect all look identical. */}
              {slot === "effect" && worn.effect !== "none" && (
                <Rail className="mb-2.5 gap-2 px-4">
                  {HUES.map((hue) => (
                    <m.button
                      key={hue}
                      type="button"
                      onClick={() => void chooseHue(hue)}
                      whileTap={{ scale: 0.9 }}
                      transition={spring.snappy}
                      aria-label={`hue ${hue}`}
                      className={`size-8 shrink-0 rounded-full transition-[box-shadow] ${
                        nameHue === hue
                          ? "shadow-[0_0_0_2px_var(--color-label)]"
                          : "shadow-[0_0_0_1px_var(--color-separator)]"
                      }`}
                      style={{ background: `oklch(0.62 0.2 ${hue})` }}
                    />
                  ))}
                </Rail>
              )}

              <Rail className="gap-2.5 px-4 pb-1">
                {shelf.map((item) => {
                  const active = worn[slot] === item.value;
                  return (
                    <m.button
                      key={item.key}
                      type="button"
                      onClick={() => void wear(slot, item)}
                      whileTap={{ scale: 0.94 }}
                      transition={spring.snappy}
                      className={`relative flex w-[104px] shrink-0 flex-col items-center gap-2 rounded-[20px] px-2 py-3 ${
                        active ? "panel-hero" : "panel"
                      } ${item.owned ? "" : "opacity-55"}`}
                    >
                      <ShelfPreview
                        slot={slot}
                        value={item.value}
                        seed={profile.avatarSeed}
                        name={profile.anonName}
                        style={worn.avatar}
                        gender={profile.gender}
                      />
                      <span className="line-clamp-2 w-full text-center text-[11px] leading-tight text-secondary">
                        {t(`shop.items.${slot}.${item.value}`)}
                      </span>

                      {active && (
                        <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-on-accent">
                          <CheckIcon size={12} />
                        </span>
                      )}
                      {!item.owned && (
                        <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-elevated text-hint">
                          <LockIcon size={11} />
                        </span>
                      )}
                    </m.button>
                  );
                })}
              </Rail>
            </m.section>
          ))}

          <m.section variants={rise} className="px-4 pt-1">
            <Button full variant="surface" onClick={() => navigate("/shop")}>
              {t("wardrobe.toShop")}
            </Button>
            <p className="mt-2.5 text-center text-[12px] leading-snug text-hint">
              {t("wardrobe.hint")}
            </p>
          </m.section>
        </m.div>
      </div>
    </PushScreen>
  );
};

/**
 * Each piece is shown doing its job rather than as an abstract swatch: the
 * frame around your own face, the name effect on your own name, the background
 * as the card it will actually paint.
 */
const ShelfPreview = ({
  slot,
  value,
  seed,
  name,
  style,
  gender,
}: {
  slot: Slot;
  value: string;
  seed: string;
  name: string;
  /** Frames are shown around the face you are actually wearing. */
  style: string;
  gender: string;
}) => {
  if (slot === "avatar") {
    return <Avatar seed={seed} style={value} gender={gender} size={58} />;
  }
  if (slot === "frame") {
    return <Avatar seed={seed} style={style} frame={value} gender={gender} size={58} />;
  }
  if (slot === "effect") {
    return (
      <span className="flex h-[58px] w-full items-center justify-center px-1">
        <span
          className={`truncate font-display text-[13px] font-extrabold ${nameEffectClass(value)}`}
        >
          {name.split(" ")[0]}
        </span>
      </span>
    );
  }
  return (
    <span
      className={`flex h-[58px] w-full items-center justify-center rounded-[15px] ${
        backgroundClass(value) || "bg-elevated shadow-[inset_0_0_0_1px_var(--color-separator)]"
      }`}
    >
      <span className="block size-6 rounded-full bg-white/70" />
    </span>
  );
};
