import { m } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { PersonSheet, type Person } from "@/features/moderation/PersonSheet";
import { useBackButton } from "@/shared/hooks/useBackButton";
import { useT } from "@/shared/i18n";
import { relativeTime } from "@/shared/lib/format";
import { listStagger, rise } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  OptionRow,
  PushScreen,
  Rail,
  ScreenHeader,
  Segmented,
  Sheet,
  Skeleton,
} from "@/shared/ui";
import { CrownIcon, SearchIcon } from "@/shared/ui/icons";
import { CoinMark, EnergyMark } from "@/shared/ui/marks";
import { useOwner, type PersonCard, type PromoCode } from "@/store/owner";
import { useSession } from "@/store/session";
import { toast } from "@/store/ui";

type Tab = "people" | "codes" | "ledger";

const CATEGORIES = ["avatar", "frame", "effect", "background", "palette"] as const;

const field =
  "w-full rounded-[14px] bg-elevated px-3.5 py-2.5 text-[14px] outline-none placeholder:text-hint";

const Amount = ({
  label,
  value,
  onChange,
  max,
  mark,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max: number;
  mark?: React.ReactNode;
}) => (
  <label className="flex items-center justify-between gap-3 rounded-[14px] bg-elevated px-3.5 py-2">
    <span className="flex items-center gap-1.5 text-[13px] text-secondary">
      {mark}
      {label}
    </span>
    <input
      type="number"
      min={0}
      max={max}
      inputMode="numeric"
      value={value || ""}
      placeholder="0"
      onChange={(event) =>
        onChange(Math.max(0, Math.min(max, Number(event.target.value) || 0)))
      }
      className="w-20 bg-transparent text-right font-display text-[15px] font-bold tabular outline-none"
    />
  </label>
);

const ItemPicker = ({
  chosen,
  onToggle,
}: {
  chosen: string[];
  onToggle: (key: string) => void;
}) => {
  const { t } = useT();
  const catalogue = useOwner((state) => state.catalogue);
  const [slot, setSlot] = useState<(typeof CATEGORIES)[number]>("avatar");

  // One shelf at a time. All five at once turns the sheet into a wall and
  // buries the button that actually sends the thing.
  const items = useMemo(
    () => catalogue.filter((item) => item.category === slot),
    [catalogue, slot],
  );

  return (
    <div className="flex flex-col gap-2.5">
      <Rail className="-mx-5 gap-1.5 px-5">
        {CATEGORIES.map((category) => (
          <Chip
            key={category}
            active={slot === category}
            onClick={() => {
              haptic.select();
              setSlot(category);
            }}
          >
            {t(`wardrobe.slots.${category}`)}
          </Chip>
        ))}
      </Rail>

      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Chip
            key={item.key}
            active={chosen.includes(item.key)}
            tone={item.exclusive ? "danger" : "neutral"}
            onClick={() => {
              haptic.select();
              onToggle(item.key);
            }}
          >
            {t(`shop.items.${item.category}.${item.value}`)}
          </Chip>
        ))}
      </div>

      {chosen.length > 0 && (
        <span className="px-1 text-[12px] text-hint">
          {t("owner.chosen", { count: chosen.length })}
        </span>
      )}
    </div>
  );
};

const PersonRow = ({ card, onOpen }: { card: PersonCard; onOpen: () => void }) => {
  const { t } = useT();
  return (
    <m.button
      type="button"
      variants={rise}
      onClick={onOpen}
      className="panel flex w-full items-center gap-3 rounded-[18px] px-3.5 py-3 text-left"
    >
      <Avatar seed={card.avatarSeed} size={42} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[14.5px] font-bold tracking-[-0.01em]">
          {card.anonName}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[12px] text-hint">
          <span className="tabular">
            {t("common.level")} {card.level}
          </span>
          <span className="flex items-center gap-1 tabular">
            <CoinMark size={12} />
            {card.coins}
          </span>
          <span className="tabular">#{card.userId}</span>
        </span>
      </span>
      {card.isBanned && <Chip tone="danger">{t("admin.banned")}</Chip>}
      {!card.isBanned && card.warnings > 0 && (
        <Chip tone="danger">{card.warnings}</Chip>
      )}
    </m.button>
  );
};

const daysLeft = (iso: string | null): number => {
  if (!iso) return 0;
  const gap = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(gap / 86400000));
};

const CodeRow = ({ code, onRevoke }: { code: PromoCode; onRevoke: () => void }) => {
  const { t } = useT();
  const spent = code.used >= code.maxUses;
  const left = daysLeft(code.expiresAt);
  return (
    <m.div variants={rise} className="panel rounded-[18px] px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code.code);
            haptic.notify("success");
            toast(t("owner.copied"));
          }}
          className="font-display text-[17px] font-extrabold tracking-[0.06em] tabular"
        >
          {code.code}
        </button>
        <span className="font-display text-[12px] font-bold text-hint tabular">
          {code.used}/{code.maxUses}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {code.coins > 0 && (
          <Chip>
            <CoinMark size={12} />+{code.coins}
          </Chip>
        )}
        {code.premiumDays > 0 && <Chip>{t("notices.premiumDays", { count: code.premiumDays })}</Chip>}
        {code.items.map((key) => (
          <Chip key={key}>{t(`shop.items.${key.split(".")[0]}.${key.split(".")[1]}`)}</Chip>
        ))}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[12px] text-hint">
          {!code.active
            ? t("owner.revoked")
            : spent
              ? t("owner.spent")
              : t("owner.expires", { count: left })}
        </span>
        {code.active && (
          <button
            type="button"
            onClick={onRevoke}
            className="font-display text-[12.5px] font-bold text-destructive"
          >
            {t("owner.revoke")}
          </button>
        )}
      </div>
    </m.div>
  );
};

export const OwnerPage = () => {
  const { t } = useT();
  const profile = useSession((state) => state.profile);
  const [tab, setTab] = useState<Tab>("people");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PersonCard | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [composing, setComposing] = useState(false);

  const [items, setItems] = useState<string[]>([]);
  const [coins, setCoins] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [premiumDays, setPremiumDays] = useState(0);
  const [note, setNote] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [daysValid, setDaysValid] = useState(30);

  const { codes, ledger, people, loading, busy } = useOwner();
  const load = useOwner((state) => state.load);
  const search = useOwner((state) => state.search);
  const grant = useOwner((state) => state.grant);
  const createCode = useOwner((state) => state.createCode);
  const revokeCode = useOwner((state) => state.revokeCode);

  useBackButton("/settings");

  useEffect(() => {
    void load();
    void search("");
  }, [load, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void search(query), 260);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  const reset = () => {
    setItems([]);
    setCoins(0);
    setEnergy(0);
    setPremiumDays(0);
    setNote("");
  };

  const toggle = (key: string) =>
    setItems((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key].slice(0, 6),
    );

  const empty = items.length === 0 && coins === 0 && energy === 0 && premiumDays === 0;

  const send = async () => {
    if (!picked || empty) return;
    const ok = await grant({
      userId: picked.userId,
      items,
      coins,
      energy,
      premiumDays,
      note: note || undefined,
    });
    if (!ok) {
      toast(t("common.error"), { tone: "danger" });
      return;
    }
    toast(t("owner.granted", { name: picked.anonName }));
    reset();
    setPicked(null);
    void search(query);
  };

  const mint = async () => {
    if (items.length === 0 && coins === 0 && premiumDays === 0) return;
    const code = await createCode({ items, coins, premiumDays, maxUses, daysValid, note: note || undefined });
    if (!code) {
      toast(t("common.error"), { tone: "danger" });
      return;
    }
    void navigator.clipboard?.writeText(code);
    toast(t("owner.minted", { code }));
    reset();
    setComposing(false);
  };

  if (!profile?.rights?.includes("owner.panel")) {
    return (
      <PushScreen>
        <ScreenHeader title={t("owner.title")} />
        <EmptyState
          icon={<CrownIcon size={24} />}
          title={t("owner.denied")}
          description={t("owner.deniedHint")}
        />
      </PushScreen>
    );
  }

  return (
    <PushScreen>
      <ScreenHeader title={t("owner.title")} subtitle={t("owner.subtitle")} />

      <div className="px-4">
        <Segmented
          id="owner-tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: "people" as const, label: t("owner.people") },
            { value: "codes" as const, label: t("owner.codes") },
            { value: "ledger" as const, label: t("owner.ledger") },
          ]}
        />
      </div>

      {tab === "people" && (
        <div className="mt-4 px-4">
          <label className="flex items-center gap-2.5 rounded-[16px] bg-elevated px-3.5 py-2.5">
            <span className="text-hint">
              <SearchIcon size={17} />
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("owner.searchPlaceholder")}
              className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-hint"
            />
          </label>
          <p className="mt-2 px-1 text-[12px] leading-snug text-hint">{t("owner.anonNote")}</p>

          {loading && people.length === 0 ? (
            <div className="mt-3 space-y-2">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-[66px]" />
              ))}
            </div>
          ) : people.length === 0 ? (
            <EmptyState
              icon={<SearchIcon size={22} />}
              title={t("owner.nobody")}
              description={t("owner.nobodyHint")}
            />
          ) : (
            <m.div
              className="mt-3 space-y-2"
              variants={listStagger}
              initial="initial"
              animate="animate"
            >
              {people.map((card) => (
                <PersonRow key={card.userId} card={card} onOpen={() => setPicked(card)} />
              ))}
            </m.div>
          )}
        </div>
      )}

      {tab === "codes" && (
        <div className="mt-4 px-4">
          <Button
            full
            icon={<CrownIcon size={17} />}
            onClick={() => {
              reset();
              setComposing(true);
            }}
          >
            {t("owner.newCode")}
          </Button>

          {codes.length === 0 ? (
            <EmptyState
              icon={<CrownIcon size={22} />}
              title={t("owner.noCodes")}
              description={t("owner.noCodesHint")}
            />
          ) : (
            <m.div
              className="mt-3 space-y-2"
              variants={listStagger}
              initial="initial"
              animate="animate"
            >
              {codes.map((code) => (
                <CodeRow key={code.id} code={code} onRevoke={() => void revokeCode(code.id)} />
              ))}
            </m.div>
          )}
        </div>
      )}

      {tab === "ledger" && (
        <div className="mt-4 px-4">
          {ledger.length === 0 ? (
            <EmptyState
              icon={<CrownIcon size={22} />}
              title={t("owner.noLedger")}
              description={t("owner.noLedgerHint")}
            />
          ) : (
            <m.div
              className="space-y-2"
              variants={listStagger}
              initial="initial"
              animate="animate"
            >
              {ledger.map((entry) => (
                <m.div key={entry.id} variants={rise} className="panel rounded-[18px] px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-display text-[14px] font-bold tracking-[-0.01em]">
                      {entry.target}
                    </span>
                    <span className="font-display text-[11.5px] font-bold text-hint tabular">
                      {relativeTime(entry.at)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {(entry.payload.coins ?? 0) > 0 && (
                      <Chip>
                        <CoinMark size={12} />+{entry.payload.coins}
                      </Chip>
                    )}
                    {(entry.payload.energy ?? 0) > 0 && (
                      <Chip>
                        <EnergyMark size={12} />+{entry.payload.energy}
                      </Chip>
                    )}
                    {(entry.payload.premiumDays ?? 0) > 0 && (
                      <Chip>{t("notices.premiumDays", { count: entry.payload.premiumDays ?? 0 })}</Chip>
                    )}
                    {(entry.payload.items ?? []).map((key) => (
                      <Chip key={key}>
                        {t(`shop.items.${key.split(".")[0]}.${key.split(".")[1]}`)}
                      </Chip>
                    ))}
                  </div>
                  {entry.note && (
                    <p className="mt-1.5 text-[12.5px] leading-snug text-hint">{entry.note}</p>
                  )}
                </m.div>
              ))}
            </m.div>
          )}
        </div>
      )}

      <Sheet
        open={picked !== null}
        onClose={() => setPicked(null)}
        title={picked?.anonName ?? ""}
        description={t("owner.grantHint")}
      >
        {picked && (
          <div className="flex flex-col gap-3.5 pb-2">
            <ItemPicker chosen={items} onToggle={toggle} />

            <div className="flex flex-col gap-1.5">
              <Amount
                label={t("owner.coins")}
                value={coins}
                onChange={setCoins}
                max={1000000}
                mark={<CoinMark size={13} />}
              />
              <Amount
                label={t("owner.energy")}
                value={energy}
                onChange={setEnergy}
                max={500}
                mark={<EnergyMark size={13} />}
              />
              <Amount
                label={t("owner.premiumDays")}
                value={premiumDays}
                onChange={setPremiumDays}
                max={365}
              />
            </div>

            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("owner.notePlaceholder")}
              className={field}
            />

            <Button full loading={busy} disabled={empty} onClick={() => void send()}>
              {t("owner.send")}
            </Button>

            <OptionRow
              title={t("owner.moderate")}
              subtitle={t("owner.moderateHint")}
              muted
              onClick={() => {
                setPerson({
                  userId: picked.userId,
                  anonName: picked.anonName,
                  avatarSeed: picked.avatarSeed,
                });
                setPicked(null);
              }}
            />
          </div>
        )}
      </Sheet>

      <Sheet
        open={composing}
        onClose={() => setComposing(false)}
        title={t("owner.newCode")}
        description={t("owner.newCodeHint")}
      >
        <div className="flex flex-col gap-3.5 pb-2">
          <ItemPicker chosen={items} onToggle={toggle} />

          <div className="flex flex-col gap-1.5">
            <Amount
              label={t("owner.coins")}
              value={coins}
              onChange={setCoins}
              max={1000000}
              mark={<CoinMark size={13} />}
            />
            <Amount
              label={t("owner.premiumDays")}
              value={premiumDays}
              onChange={setPremiumDays}
              max={365}
            />
            <Amount label={t("owner.uses")} value={maxUses} onChange={setMaxUses} max={10000} />
            <Amount
              label={t("owner.daysValid")}
              value={daysValid}
              onChange={setDaysValid}
              max={365}
            />
          </div>

          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("owner.notePlaceholder")}
            className={field}
          />

          <Button
            full
            loading={busy}
            disabled={items.length === 0 && coins === 0 && premiumDays === 0}
            onClick={() => void mint()}
          >
            {t("owner.mint")}
          </Button>
        </div>
      </Sheet>

      <PersonSheet person={person} onClose={() => setPerson(null)} />
    </PushScreen>
  );
};
