import { useCallback, useEffect, useState } from "react";

import { useT } from "@/shared/i18n";
import { request } from "@/shared/lib/api";
import { haptic } from "@/shared/lib/telegram";
import { Avatar, Button, Chip, OptionRow, Sheet } from "@/shared/ui";
import { toast } from "@/store/ui";

interface Record {
  warnings: number;
  isBanned: boolean;
  mutedUntil: string | null;
}

interface ActionState {
  userId: number;
  actions: string[];
  blocked: boolean;
  role: string;
  record?: Record;
}

export interface Person {
  userId: number;
  anonName: string;
  avatarSeed: string;
}

// Everything a moderator can do needs a second tap, because none of it is
// reversible from the person's side.
const HEAVY = new Set(["warn", "mute_24h", "ban_7d", "ban_permanent"]);
const STAFF = ["warn", "mute_24h", "ban_7d", "ban_permanent", "unban"];

/**
 * One place that answers "what may I do about this person".
 *
 * The server decides the list, not the client: a player is offered a block and
 * a report, a moderator a warning and a mute, an admin a ban. Nothing is
 * rendered hopefully and refused later.
 */
export const PersonSheet = ({
  person,
  onClose,
  onReport,
}: {
  person: Person | null;
  onClose: () => void;
  onReport?: (userId: number) => void;
}) => {
  const { t } = useT();
  const [state, setState] = useState<ActionState | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const userId = person?.userId ?? 0;

  useEffect(() => {
    setState(null);
    setPending(null);
    if (!userId) return;
    let alive = true;
    void request<ActionState>(`/users/${userId}/actions`)
      .then((payload) => alive && setState(payload))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [userId]);

  const apply = useCallback(
    async (action: string) => {
      if (!userId) return;
      setBusy(true);
      try {
        const next = await request<ActionState>(`/users/${userId}/actions`, {
          method: "POST",
          body: { action },
        });
        setState(next);
        setPending(null);
        haptic.notify("success");
        toast(t(`moderation.applied.${action}`));
        if (action === "block") onClose();
      } catch {
        toast(t("common.error"), { tone: "danger" });
      } finally {
        setBusy(false);
      }
    },
    [userId, onClose, t],
  );

  const choose = (action: string) => {
    haptic.select();
    if (HEAVY.has(action)) {
      setPending(action);
      return;
    }
    void apply(action);
  };

  const can = (action: string) => state?.actions.includes(action) ?? false;
  const record = state?.record;
  // Lifting a ban is only an action when there is one to lift.
  const serving = Boolean(record?.isBanned || record?.mutedUntil);
  const staffActions = STAFF.filter((action) => can(action) && (action !== "unban" || serving));

  return (
    <Sheet
      open={person !== null}
      onClose={onClose}
      title={person?.anonName ?? ""}
      description={state && state.role !== "none" ? t(`moderation.roles.${state.role}`) : undefined}
    >
      {person && (
        <div className="flex flex-col gap-3 pb-2">
          <div className="flex items-center gap-3.5">
            <Avatar seed={person.avatarSeed} size={52} />
            {record ? (
              <div className="flex flex-wrap gap-1.5">
                <Chip tone={record.warnings > 0 ? "danger" : "neutral"}>
                  {t("moderation.warnings", { count: record.warnings })}
                </Chip>
                {record.isBanned && <Chip tone="danger">{t("admin.banned")}</Chip>}
                {record.mutedUntil && <Chip tone="danger">{t("admin.muted")}</Chip>}
              </div>
            ) : (
              <p className="text-[12.5px] leading-snug text-hint">{t("moderation.anonHint")}</p>
            )}
          </div>

          {pending ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-[13.5px] leading-snug text-secondary">
                {t("moderation.confirmBody", { action: t(`admin.actions.${pending}`) })}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button full size="sm" variant="surface" onClick={() => setPending(null)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  full
                  size="sm"
                  variant="danger"
                  loading={busy}
                  onClick={() => void apply(pending)}
                >
                  {t("moderation.confirmYes")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {onReport && can("report") && (
                <OptionRow
                  title={t("moderation.report")}
                  subtitle={t("moderation.reportHint")}
                  onClick={() => {
                    haptic.select();
                    onReport(person.userId);
                    onClose();
                  }}
                />
              )}

              {can("block") && !state?.blocked && (
                <OptionRow
                  title={t("moderation.block")}
                  subtitle={t("moderation.blockHint")}
                  muted
                  onClick={() => choose("block")}
                />
              )}

              {staffActions.length > 0 && (
                <div className="mt-1 flex flex-col gap-2">
                  <span className="px-1 text-[12px] text-hint">{t("moderation.staffOnly")}</span>
                  {staffActions.map((action) => (
                    <OptionRow
                      key={action}
                      title={t(`admin.actions.${action}`)}
                      muted={action !== "unban"}
                      onClick={() => choose(action)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
};
