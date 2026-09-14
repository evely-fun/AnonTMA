import { m } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useBackButton } from "@/shared/hooks/useBackButton";
import { useT } from "@/shared/i18n";
import { listStagger, rise, spring } from "@/shared/lib/motion";
import { backgroundClass, nameEffectClass } from "@/shared/lib/cosmetics";
import { haptic, openInvoice } from "@/shared/lib/telegram";
import {
  paletteSwatch,
  resolveScheme,
  type Palette,
  type ThemeMode,
} from "@/shared/lib/theme";
import type { ShopItem } from "@/shared/lib/types";
import { Avatar, Button, IconTile, PushScreen, Rail, ScreenHeader } from "@/shared/ui";
import {
  CheckIcon,
  CrownIcon,
  LockIcon,
  SparkleIcon,
} from "@/shared/ui/icons";
import { CoinMark, EnergyMark, StarMark } from "@/shared/ui/marks";
import { useEconomy } from "@/store/economy";
import { defaultStyleFor } from "@/shared/lib/avatars";
import { useSession } from "@/store/session";
import { useShop } from "@/store/shop";
import { toast } from "@/store/ui";

/** The coin shelves, plus one that is paid for in stars. */
type Tab = ShopItem["category"] | "stars";

const ORDER: Tab[] = [
  "stars",
  "avatar",
  "frame",
  "effect",
  "background",
  "palette",
  "boost",
  "premium",
];

const RARITY_TONE: Record<ShopItem["rarity"], string> = {
  base: "text-hint",
  common: "text-secondary",
  rare: "text-accent",
  epic: "text-warn",
  legendary: "text-destructive",
  mythic: "text-destructive",
};

const Preview = ({
  item,
  seed,
  scheme,
}: {
  item: ShopItem;
  seed: string;
  scheme: "dark" | "light";
}) => {
  if (item.category === "avatar") {
    return <Avatar seed={seed} style={item.value} size={46} />;
  }
  if (item.category === "frame") {
    return <Avatar seed={seed} frame={item.value} size={46} />;
  }
  if (item.category === "background") {
    // The empty skin paints nothing, so the none row needs a neutral tile of
    // its own or it sits with no swatch while every other row has one.
    return (
      <span
        className={`block size-11 rounded-[14px] ${
          backgroundClass(item.value) ||
          "bg-elevated shadow-[inset_0_0_0_1px_var(--color-separator)]"
        }`}
      />
    );
  }
  if (item.category === "palette") {
    // The swatch has to be resolved from the palette itself, not from the
    // tokens on the root, or every option previews as the active theme.
    const swatch = paletteSwatch(item.value as Palette, scheme);
    return (
      <span
        className="block size-11 rounded-full"
        style={{
          background: `linear-gradient(150deg, ${swatch.accent}, ${swatch.ground})`,
        }}
      />
    );
  }
  if (item.category === "premium") {
    return (
      <span className="flex size-11 items-center justify-center rounded-[14px] bg-accent-quiet text-accent">
        <CrownIcon size={21} />
      </span>
    );
  }
  if (item.category === "boost") {
    return (
      <span className="flex size-11 items-center justify-center rounded-[14px] bg-warn/15 text-warn">
        <SparkleIcon size={20} />
      </span>
    );
  }
  return (
    <span className="flex size-11 items-center justify-center rounded-[14px] bg-elevated">
      <span
        className={`font-display text-[15px] font-extrabold ${nameEffectClass(item.value)}`}
      >
        Aa
      </span>
    </span>
  );
};

/**
 * The one shelf paid for in stars rather than coins. Coins buy cosmetics you
 * can also grind for; this is the shelf for the things you cannot, and for
 * buying coins outright rather than playing for them.
 */
const StarShelf = () => {
  const { t } = useT();
  const products = useEconomy((store) => store.products);
  const mode = useEconomy((store) => store.mode);
  const purchase = useEconomy((store) => store.purchase);
  const loadProducts = useEconomy((store) => store.loadProducts);
  const loadEconomy = useEconomy((store) => store.load);
  const refreshProfile = useSession((state) => state.refreshProfile);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const buy = async (key: string) => {
    haptic.impact("medium");
    setPending(key);
    try {
      const result = await purchase(key);
      if (result?.url) {
        openInvoice(result.url);
        return;
      }
      if (result) {
        haptic.notify("success");
        toast(t("shop.bought"), { tone: "success" });
        void refreshProfile();
        void loadEconomy();
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <m.div
      key="stars"
      className="mt-4 flex flex-col gap-2.5 px-4"
      variants={listStagger}
      initial="initial"
      animate="animate"
    >
      {mode === "test" && (
        <p className="text-center text-[12px] text-hint">{t("economy.testMode")}</p>
      )}
      {products.map((product) => (
        <m.div
          key={product.key}
          variants={rise}
          className="panel flex items-center gap-3.5 rounded-[20px] px-4 py-3.5"
        >
          <IconTile tone={product.kind === "set" ? "accent" : "neutral"} size={44}>
            {product.kind === "coins" ? (
              <CoinMark size={22} />
            ) : product.kind === "energy" ? (
              <EnergyMark size={22} />
            ) : (
              <CrownIcon size={20} />
            )}
          </IconTile>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[14.5px] font-extrabold leading-tight tracking-[-0.01em]">
              {product.title}
            </span>
            <span className="mt-0.5 block text-[12px] leading-snug text-hint">
              {product.description}
            </span>
          </span>
          <Button
            size="sm"
            loading={pending === product.key}
            onClick={() => void buy(product.key)}
            icon={<StarMark size={16} />}
          >
            {product.stars}
          </Button>
        </m.div>
      ))}
    </m.div>
  );
};

export const ShopPage = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const refreshProfile = useSession((state) => state.refreshProfile);
  const loadEconomy = useEconomy((store) => store.load);
  const items = useShop((store) => store.items);
  const coins = useShop((store) => store.coins);
  const equipped = useShop((store) => store.equipped);
  const busy = useShop((store) => store.busy);
  const load = useShop((store) => store.load);
  const buy = useShop((store) => store.buy);
  const equip = useShop((store) => store.equip);
  const scheme = resolveScheme(
    (profile?.preferences?.theme ?? "auto") as ThemeMode,
  );
  const [tab, setTab] = useState<Tab>("avatar");

  useBackButton("/");

  useEffect(() => {
    void load();
  }, [load]);

  const seed = profile?.avatarSeed ?? "anon";
  const suggested = defaultStyleFor(profile?.gender);
  const shown = useMemo(() => {
    const list = items.filter((item) => item.category === tab);
    if (tab !== "avatar") return list;
    return [...list].sort((a, b) => {
      const rank = (item: ShopItem) =>
        item.owned ? 0 : item.value === suggested ? 1 : 2;
      return rank(a) - rank(b);
    });
  }, [items, tab, suggested]);

  const onBuy = async (item: ShopItem) => {
    haptic.impact("medium");
    const result = await buy(item.key);
    if (result === "poor") {
      toast(t("shop.notEnough"), { tone: "danger" });
      return;
    }
    if (result === "error") {
      toast(t("shop.failed"), { tone: "danger" });
      return;
    }
    haptic.notify("success");
    toast(t("shop.bought"), {
      description: t(`shop.items.${item.category}.${item.value}`),
      tone: "success",
    });
    void refreshProfile();
    void loadEconomy();
  };

  const onEquip = async (item: ShopItem) => {
    haptic.select();
    if (await equip(item.key)) {
      toast(t("shop.equippedToast"), { tone: "success" });
      void refreshProfile();
    }
  };

  const isWorn = (item: ShopItem) =>
    (item.category === "avatar" && equipped.avatar === item.value) ||
    (item.category === "frame" && equipped.frame === item.value) ||
    (item.category === "effect" && equipped.effect === item.value) ||
    (item.category === "background" && equipped.background === item.value);

  return (
    <PushScreen>
      <ScreenHeader
        title={t("shop.title")}
        subtitle={t("shop.subtitle")}
        onBack={() => navigate("/")}
        trailing={
          <span className="flex items-center gap-1.5 rounded-full bg-elevated px-3 py-1.5 font-display text-[13px] font-extrabold tabular">
            <CoinMark size={15} />
            {coins.toLocaleString("en-US")}
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto pb-[calc(28px+env(safe-area-inset-bottom))] pt-3">
        <Rail className="-mx-4 gap-2 px-8 pb-1">
          {ORDER.map((category) => (
            <button
              key={category}
              type="button"
              onPointerDown={() => haptic.select()}
              onClick={() => setTab(category)}
              className={`h-9 shrink-0 rounded-full px-4 font-display text-[12.5px] font-bold tracking-[-0.01em] transition-colors ${
                tab === category
                  ? "bg-label text-bg"
                  : "bg-elevated text-secondary"
              }`}
            >
              {t(`shop.categories.${category}`)}
            </button>
          ))}
        </Rail>

        {tab === "stars" ? (
          <StarShelf />
        ) : (
        <m.div
          key={tab}
          className="mt-4 grid grid-cols-2 gap-2.5 px-4"
          variants={listStagger}
          initial="initial"
          animate="animate"
        >
          {shown.map((item) => {
            const worn = isWorn(item);
            const pending = busy === item.key;
            return (
              <m.div
                key={item.key}
                variants={rise}
                className={`flex flex-col items-center gap-2 rounded-[20px] px-3 py-4 ${
                  worn ? "panel-hero" : "panel"
                }`}
              >
                {/* A shelf, not a list. The goods are shown at a size worth
                    looking at and the price sits under each one. */}
                <span className="scale-[1.45] py-3">
                  <Preview item={item} seed={seed} scheme={scheme} />
                </span>

                <p className="line-clamp-2 w-full text-center font-display text-[13px] font-bold leading-tight">
                  {t(`shop.items.${item.category}.${item.value}`)}
                </p>
                {/* Base is what most of the shelf is, so printing it on every
                    tile says nothing. Rarity is only worth a line when it is
                    something to notice. */}
                {item.rarity !== "base" && (
                  <p
                    className={`text-[11px] font-semibold ${RARITY_TONE[item.rarity]}`}
                  >
                    {t(`shop.rarity.${item.rarity}`)}
                  </p>
                )}

                <span className="mt-auto w-full pt-1">
                  {worn ? (
                    <span className="flex h-9 items-center justify-center gap-1.5 font-display text-[12px] font-bold text-accent">
                      <CheckIcon size={15} />
                      {t("shop.equipped")}
                    </span>
                  ) : item.owned && !item.consumable ? (
                    <Button
                      full
                      size="sm"
                      variant="surface"
                      loading={pending}
                      onClick={() => void onEquip(item)}
                    >
                      {t("shop.equip")}
                    </Button>
                  ) : (
                    <m.button
                      type="button"
                      disabled={pending}
                      onClick={() => void onBuy(item)}
                      whileTap={{ scale: 0.95 }}
                      transition={spring.snappy}
                      className={`flex h-9 w-full items-center justify-center gap-1.5 rounded-[12px] px-3 font-display text-[13px] font-extrabold tabular ${
                        item.affordable
                          ? "primary-action"
                          : "bg-elevated text-hint"
                      }`}
                    >
                      {item.affordable ? (
                        <CoinMark size={14} />
                      ) : (
                        <LockIcon size={12} />
                      )}
                      {item.price.toLocaleString("en-US")}
                    </m.button>
                  )}
                </span>

                {item.category === "avatar" &&
                  item.value === suggested &&
                  !item.owned && (
                    <span className="text-[10.5px] text-accent">
                      {t("shop.suggested")}
                    </span>
                  )}
              </m.div>
            );
          })}
        </m.div>
        )}

        {tab !== "stars" && (
          <p className="px-6 pt-5 text-center text-[12px] leading-snug text-hint">
            {t("shop.howToEarn")}
          </p>
        )}
      </div>
    </PushScreen>
  );
};
