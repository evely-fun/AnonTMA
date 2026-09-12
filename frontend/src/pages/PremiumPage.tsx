import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useBackButton } from "@/shared/hooks/useBackButton";
import { useT } from "@/shared/i18n";
import { listStagger, rise, spring } from "@/shared/lib/motion";
import { haptic, openLink } from "@/shared/lib/telegram";
import { Button, PushScreen, ScreenHeader, SectionHead } from "@/shared/ui";
import {
  BoltIcon,
  CheckIcon,
  CrownIcon,
  PaletteIcon,
  ShieldIcon,
  SparkleIcon,
  WaveIcon,
  WheelIcon,
} from "@/shared/ui/icons";
import { useEconomy } from "@/store/economy";
import { useSession } from "@/store/session";
import { toast } from "@/store/ui";

const PERKS = [
  { key: "energy", Icon: BoltIcon },
  { key: "voice", Icon: WaveIcon },
  { key: "noise", Icon: ShieldIcon },
  { key: "themes", Icon: PaletteIcon },
  { key: "priority", Icon: SparkleIcon },
  { key: "wheel", Icon: WheelIcon },
];

export const PremiumPage = () => {
  const { t, locale } = useT();
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const refreshProfile = useSession((state) => state.refreshProfile);
  const products = useEconomy((store) => store.products);
  const mode = useEconomy((store) => store.mode);
  const loadProducts = useEconomy((store) => store.loadProducts);
  const load = useEconomy((store) => store.load);
  const purchase = useEconomy((store) => store.purchase);
  const [pending, setPending] = useState<string | null>(null);

  useBackButton("/profile");

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const active = profile?.premium?.active ?? false;
  const until = profile?.premium?.until
    ? new Date(profile.premium.until).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const buy = async (key: string) => {
    setPending(key);
    haptic.impact("medium");
    const result = await purchase(key);
    setPending(null);
    if (!result) {
      toast(t("economy.purchaseFailed"), { tone: "danger" });
      return;
    }
    if (result.url) {
      openLink(result.url);
      return;
    }
    haptic.notify("success");
    toast(t("economy.purchased"), { tone: "success" });
    void refreshProfile();
    void load();
  };

  return (
    <PushScreen>
      <ScreenHeader
        title={t("economy.premiumTitle")}
        subtitle={t("economy.premiumSubtitle")}
        onBack={() => navigate("/profile")}
      />

      <m.div
        className="flex-1 space-y-7 overflow-y-auto pb-[calc(28px+env(safe-area-inset-bottom))] pt-4"
        variants={listStagger}
        initial="initial"
        animate="animate"
      >
        <m.section className="px-4" variants={rise}>
          <div className="panel-hero relative overflow-hidden rounded-[24px] px-5 py-6 text-center">
            <m.span
              className="mx-auto flex size-16 items-center justify-center rounded-[22px] bg-accent-quiet text-accent"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
            >
              <CrownIcon size={30} />
            </m.span>
            <h2 className="mt-4 font-display text-[24px] font-extrabold tracking-[-0.03em]">
              {t("economy.premiumTitle")}
            </h2>
            {active ? (
              <p className="mt-1.5 text-[13.5px] text-secondary">
                {t("economy.active")}
                {until ? ` · ${t("economy.until", { date: until })}` : ""}
              </p>
            ) : (
              <p className="mt-1.5 text-[13.5px] text-secondary">{t("economy.premiumSubtitle")}</p>
            )}
          </div>
        </m.section>

        <m.section variants={rise}>
          <SectionHead title={t("economy.perksTitle")} />
          <div className="grid grid-cols-2 gap-2.5 px-4">
            {PERKS.map(({ key, Icon }) => (
              <div key={key} className="panel flex flex-col gap-2 rounded-[18px] px-3.5 py-3.5">
                <Icon size={18} className="text-accent" />
                <span className="text-[12.5px] leading-snug text-secondary">
                  {t(`economy.perks.${key}`)}
                </span>
              </div>
            ))}
          </div>
        </m.section>

        <m.section variants={rise}>
          <SectionHead title={t("economy.products")} note={mode === "test" ? t("economy.testMode") : undefined} />
          <div className="space-y-2.5 px-4">
            {products.map((product) => (
              <m.div
                key={product.key}
                whileTap={{ scale: 0.99 }}
                transition={spring.snappy}
                className="panel flex items-center gap-3 rounded-[20px] px-4 py-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[15px] font-extrabold tracking-[-0.01em]">
                    {product.title}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-hint">
                    {product.description}
                  </span>
                  <span className="mt-1.5 block font-display text-[11px] font-bold uppercase tracking-[0.1em] text-hint">
                    {product.recurring ? t("economy.perMonth") : t("economy.oneOff")}
                  </span>
                </span>
                <Button
                  size="sm"
                  loading={pending === product.key}
                  onClick={() => void buy(product.key)}
                  icon={<SparkleIcon size={14} />}
                >
                  {product.stars}
                </Button>
              </m.div>
            ))}
          </div>
        </m.section>

        {active && (
          <m.section className="px-4" variants={rise}>
            <div className="flex items-center gap-3 rounded-[18px] bg-live-quiet px-4 py-3.5">
              <CheckIcon size={18} className="text-live" />
              <p className="text-[13px] text-secondary">{t("economy.active")}</p>
            </div>
          </m.section>
        )}
      </m.div>
    </PushScreen>
  );
};
