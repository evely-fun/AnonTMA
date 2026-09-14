import { useEffect } from "react";
import { create } from "zustand";

import { useT } from "@/shared/i18n";
import { useSession } from "@/store/session";
import { request } from "@/shared/lib/api";
import { haptic } from "@/shared/lib/telegram";
import { Button, IconTile, Sheet } from "@/shared/ui";
import { CrownIcon, FlagIcon, ShieldIcon } from "@/shared/ui/icons";
import { CoinMark } from "@/shared/ui/marks";

export interface Notice {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
}

interface NoticeState {
  queue: Notice[];
  load: () => Promise<void>;
  push: (notice: Notice) => void;
  dismiss: () => Promise<void>;
}

/**
 * Things the app owes you: a warning, a mute, a gift. One at a time, because a
 * stack of them at once reads as an error state rather than as being spoken
 * to, and each is marked seen only once it has actually been shown.
 */
export const useNotices = create<NoticeState>((set, get) => ({
  queue: [],

  load: async () => {
    try {
      const payload = await request<{ notices: Notice[] }>("/owner/notices");
      set({ queue: payload.notices });
    } catch {
      /* nothing owed, or not signed in yet */
    }
  },

  push: (notice) => set({ queue: [...get().queue, notice] }),

  dismiss: async () => {
    const [current, ...rest] = get().queue;
    set({ queue: rest });
    if (!current) return;
    try {
      await request("/owner/notices/seen", { method: "POST", body: { ids: [current.id] } });
    } catch {
      /* it stays unread and comes back next time, which is the safe failure */
    }
  },
}));

const TONE: Record<string, "danger" | "warn" | "accent" | "live"> = {
  warning: "warn",
  muted: "warn",
  banned: "danger",
  unbanned: "live",
  gift: "accent",
  promo: "accent",
};

const Mark = ({ kind }: { kind: string }) => {
  if (kind === "gift" || kind === "promo") return <CrownIcon size={22} />;
  if (kind === "unbanned") return <ShieldIcon size={22} />;
  return <FlagIcon size={22} />;
};

export const NoticeSheet = () => {
  const { t } = useT();
  const queue = useNotices((state) => state.queue);
  const load = useNotices((state) => state.load);
  const dismiss = useNotices((state) => state.dismiss);
  const current = queue[0] ?? null;
  // The sheet lives above the router, so it mounts before sign in finishes.
  // Asking for the inbox only once there is a profile is the difference
  // between a warning arriving and a silent 401.
  const userId = useSession((state) => state.profile?.id ?? 0);

  useEffect(() => {
    if (userId) void load();
  }, [load, userId]);

  useEffect(() => {
    if (current) haptic.notify(current.kind === "gift" ? "success" : "warning");
  }, [current]);

  const count = Number(current?.payload?.count ?? 0);
  const hours = Number(current?.payload?.hours ?? 0);
  const coins = Number(current?.payload?.coins ?? 0);
  const items = (current?.payload?.items as string[] | undefined) ?? [];
  const premiumDays = Number(current?.payload?.premiumDays ?? 0);

  const body = (() => {
    if (!current) return "";
    switch (current.kind) {
      case "warning":
        return t("notices.warningBody", { count });
      case "muted":
        return t("notices.mutedBody", { hours });
      case "banned":
        return hours > 0 ? t("notices.bannedBody", { hours }) : t("notices.bannedForever");
      case "unbanned":
        return t("notices.unbannedBody");
      default:
        return t("notices.giftBody");
    }
  })();

  return (
    <Sheet
      open={current !== null}
      onClose={() => void dismiss()}
      title={current ? t(`notices.${current.kind}Title`) : ""}
    >
      {current && (
        <div className="flex flex-col items-center gap-4 pb-2 text-center">
          <IconTile tone={TONE[current.kind] ?? "accent"} size={54}>
            <Mark kind={current.kind} />
          </IconTile>

          <p className="text-[14px] leading-snug text-secondary">{body}</p>

          {(coins > 0 || items.length > 0 || premiumDays > 0) && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {coins > 0 && (
                <span className="flex items-center gap-1.5 rounded-full bg-elevated px-3 py-1.5 text-[13px] font-semibold tabular">
                  <CoinMark size={15} />+{coins}
                </span>
              )}
              {premiumDays > 0 && (
                <span className="rounded-full bg-elevated px-3 py-1.5 text-[13px] font-semibold">
                  {t("notices.premiumDays", { count: premiumDays })}
                </span>
              )}
              {items.map((key) => (
                <span
                  key={key}
                  className="rounded-full bg-elevated px-3 py-1.5 text-[13px] font-semibold"
                >
                  {t(`shop.items.${key.split(".")[0]}.${key.split(".")[1]}`)}
                </span>
              ))}
            </div>
          )}

          {current.kind === "warning" && (
            <p className="text-[12.5px] leading-snug text-hint">{t("notices.warningTail")}</p>
          )}

          <Button full onClick={() => void dismiss()}>
            {t("notices.understood")}
          </Button>
        </div>
      )}
    </Sheet>
  );
};
