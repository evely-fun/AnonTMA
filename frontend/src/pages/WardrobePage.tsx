import { m } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useBackButton } from "@/shared/hooks/useBackButton";
import { useT } from "@/shared/i18n";
import { backgroundClass, nameEffectClass } from "@/shared/lib/cosmetics";
import { listStagger, rise, spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import type { ShopItem } from "@/shared/lib/types";
import { Avatar, Button, PushScreen, ScreenHeader, Segmented, Skeleton } from "@/shared/ui";
import { CheckIcon, LockIcon } from "@/shared/ui/icons";
import { useSession } from "@/store/session";
import { useShop } from "@/store/shop";
import { toast } from "@/store/ui";

type Slot = "avatar" | "frame" | "effect" | "background";

const SLOTS: Slot[] = ["avatar", "frame", "effect", "background"];

const RARITY_TONE: Record<ShopItem["rarity"], string> = {
  base: "text-hint",
  common: "text-secondary",
  rare: "text-accent",
  epic: "text-warn",
  legendary: "text-destructive",
};

export const WardrobePage = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const refreshProfile = useSession((state) => state.refreshProfile);
  const items = useShop((store) => store.items);
  const equipped = useShop((store) => store.equipped);
  const load = useShop((store) => store.load);
  const equip = useShop((store) => store.equip);

  const [slot, setSlot] = useState<Slot>("avatar");
  // The preview follows the tap immediately, the request catches up after.
  const [draft, setDraft] = useState<Record<Slot, string> | null>(null);

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

  const slotItems = useMemo(
    () => items.filter((item) => item.category === slot),
    [items, slot],
  );

  const ownedCount = slotItems.filter((item) => item.owned).length;

  const wear = async (item: ShopItem) => {
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
          <Skeleton className="h-[190px]" />
          <Skeleton className="h-[52px]" />
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

      <div className="flex-1 overflow-y-auto pb-[calc(28px+env(safe-area-inset-bottom))] pt-4">
        <m.div variants={listStagger} initial="initial" animate="animate" className="space-y-5">
          <m.section className="px-4" variants={rise}>
            <div
              className={`panel-hero flex flex-col items-center rounded-[24px] px-5 py-7 text-center ${backgroundClass(
                worn.background,
              )}`}
            >
              <Avatar
                seed={profile.avatarSeed}
                style={worn.avatar}
                frame={worn.frame}
                size={96}
              />
              <p
                className={`mt-4 font-display text-[21px] font-extrabold tracking-[-0.025em] ${nameEffectClass(
                  worn.effect,
                )}`}
              >
                {profile.anonName}
              </p>
              <p className="mt-1 font-display text-[11px] font-bold tracking-[0.01em] text-hint">
                {t("wardrobe.preview")}
              </p>
            </div>
          </m.section>

          <m.section className="px-4" variants={rise}>
            <Segmented
              id="wardrobe-slot"
              value={slot}
              onChange={setSlot}
              options={SLOTS.map((value) => ({ value, label: t(`wardrobe.slots.${value}`) }))}
            />
            <p className="mt-2.5 px-1 font-display text-[11px] font-bold tracking-[0.1em] text-hint tabular">
              {t("wardrobe.owned", { count: ownedCount, total: slotItems.length })}
            </p>
          </m.section>

          <m.section className="px-4" variants={rise}>
            <div className="grid grid-cols-3 gap-2.5">
              {slotItems.map((item) => {
                const active = worn[slot] === item.value;
                return (
                  <m.button
                    key={item.key}
                    type="button"
                    onClick={() => void wear(item)}
                    whileTap={{ scale: 0.95 }}
                    transition={spring.snappy}
                    className={`relative flex flex-col items-center gap-2 rounded-[18px] px-2 py-3.5 ${
                      active ? "panel-hero" : "quiet-panel"
                    } ${item.owned ? "" : "opacity-60"}`}
                  >
                    <SlotPreview slot={slot} item={item} seed={profile.avatarSeed} />
                    <span className="line-clamp-2 w-full px-0.5 text-center text-[11px] leading-tight text-secondary">
                      {t(`shop.items.${slot}.${item.value}`)}
                    </span>
                    <span
                      className={`font-display text-[9.5px] font-bold tracking-[0.01em] ${
                        RARITY_TONE[item.rarity]
                      }`}
                    >
                      {t(`shop.rarity.${item.rarity}`)}
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
            </div>
          </m.section>

          <m.section className="px-4" variants={rise}>
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

/** Each slot previews differently: the avatar itself, a ring, a letterform, a skin. */
const SlotPreview = ({ slot, item, seed }: { slot: Slot; item: ShopItem; seed: string }) => {
  if (slot === "avatar") {
    return <Avatar seed={seed} style={item.value} size={46} />;
  }
  if (slot === "frame") {
    return <Avatar seed={seed} frame={item.value} size={46} />;
  }
  if (slot === "effect") {
    return (
      <span
        className={`flex size-[46px] items-center justify-center rounded-full bg-elevated font-display text-[17px] font-extrabold ${nameEffectClass(
          item.value,
        )}`}
      >
        Aa
      </span>
    );
  }
  return (
    <span
      className={`size-[46px] rounded-[15px] ${
        backgroundClass(item.value) ||
        "bg-elevated shadow-[inset_0_0_0_1px_var(--color-separator)]"
      }`}
    />
  );
};
