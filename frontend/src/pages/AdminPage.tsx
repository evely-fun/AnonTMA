import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useBackButton } from "@/shared/hooks/useBackButton";
import { useT } from "@/shared/i18n";
import { relativeTime } from "@/shared/lib/format";
import { listStagger, rise, spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import type { ModerationCase, ModerationReport } from "@/shared/lib/types";
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  PushScreen,
  ScreenHeader,
  SectionHead,
  Segmented,
  Sheet,
  Skeleton,
} from "@/shared/ui";
import { ShieldIcon } from "@/shared/ui/icons";
import { useAdmin } from "@/store/admin";
import { toast } from "@/store/ui";

const ACTIONS = ["dismiss", "warn", "mute_24h", "ban_7d", "ban_permanent"] as const;

const priorityTone = (value: number): string => {
  if (value >= 1200) return "bg-destructive-quiet text-destructive";
  if (value >= 600) return "bg-warn/15 text-warn";
  return "bg-elevated text-secondary";
};

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="panel flex flex-col gap-1 rounded-[16px] px-3 py-2.5">
    <span className="font-display text-[20px] font-extrabold leading-none tracking-[-0.03em] tabular">
      {value}
    </span>
    <span className="text-[11px] text-hint">
      {label}
    </span>
  </div>
);

const Evidence = ({ report }: { report: ModerationReport }) => {
  const { t } = useT();
  const messages = report.evidence.messages ?? [];
  const dialog = report.evidence.dialog;

  return (
    <div className="panel rounded-[16px] px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-hint">
          {t(`chat.reasons.${report.reason}`)}
        </span>
        <span className="font-display text-[11px] font-bold text-hint tabular">
          {relativeTime(report.createdAt)}
        </span>
      </div>

      {report.details && (
        <p className="mt-2 text-[12.5px] leading-snug text-secondary">{report.details}</p>
      )}

      {dialog && (
        <p className="mt-2 font-display text-[11px] font-bold tracking-[0.01em] text-hint tabular">
          {dialog.mode} · {Math.round(dialog.durationSeconds / 60)}m
        </p>
      )}

      {messages.length > 0 ? (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-[11px] px-3 py-1.5 text-[12.5px] leading-snug ${
                message.byTarget
                  ? "bg-destructive-quiet text-label"
                  : "bg-elevated/70 text-secondary"
              }`}
            >
              <span className="mr-1.5 text-[11px] opacity-60">
                {message.byTarget ? t("admin.fromTarget") : t("admin.fromReporter")}
              </span>
              {message.text}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-hint">{t("admin.noText")}</p>
      )}
    </div>
  );
};

const CaseRow = ({ item, onOpen }: { item: ModerationCase; onOpen: () => void }) => {
  const { t } = useT();
  const reasons = Object.entries(item.reasons).sort((a, b) => b[1] - a[1]);

  return (
    <m.button
      type="button"
      variants={rise}
      onPointerDown={() => haptic.select()}
      onClick={onOpen}
      whileTap={{ scale: 0.985 }}
      transition={spring.snappy}
      className="panel flex w-full items-start gap-3.5 rounded-[18px] px-4 py-3.5 text-left"
    >
      <Avatar seed={item.target.avatarSeed} size={42} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-display text-[14.5px] font-bold tracking-[-0.01em]">
            {item.target.anonName}
          </span>
          {item.target.isBanned && (
            <span className="shrink-0 rounded-full bg-destructive-quiet px-2 py-0.5 font-display text-[9.5px] font-bold tracking-[0.01em] text-destructive">
              {t("admin.banned")}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[12px] text-hint">
          {t("admin.reporters", { count: item.reporterCount })} ·{" "}
          {t("admin.trust", { value: item.target.trustScore })}
        </span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          {reasons.slice(0, 3).map(([reason, count]) => (
            <span
              key={reason}
              className="rounded-full bg-elevated px-2 py-0.5 font-display text-[10px] font-bold tracking-[0.07em] text-secondary"
            >
              {t(`chat.reasons.${reason}`)} {count}
            </span>
          ))}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 font-display text-[11px] font-extrabold tabular ${priorityTone(
          item.priority,
        )}`}
      >
        {item.priority}
      </span>
    </m.button>
  );
};

export const AdminPage = () => {
  const { t, locale } = useT();
  const navigate = useNavigate();
  const allowed = useAdmin((store) => store.allowed);
  const overview = useAdmin((store) => store.overview);
  const cases = useAdmin((store) => store.cases);
  const detail = useAdmin((store) => store.detail);
  const loading = useAdmin((store) => store.loading);
  const busy = useAdmin((store) => store.busy);
  const check = useAdmin((store) => store.check);
  const load = useAdmin((store) => store.load);
  const open = useAdmin((store) => store.open);
  const close = useAdmin((store) => store.close);
  const resolve = useAdmin((store) => store.resolve);
  const [tab, setTab] = useState<"open" | "resolved">("open");

  useBackButton("/profile");

  useEffect(() => {
    void check().then((ok) => {
      if (!ok) navigate("/profile", { replace: true });
    });
  }, [check, navigate]);

  useEffect(() => {
    if (allowed) void load(tab);
  }, [allowed, load, tab]);

  if (!allowed) return null;

  const apply = async (action: string) => {
    if (!detail) return;
    haptic.impact("medium");
    if (await resolve(detail.id, action)) {
      haptic.notify("success");
      toast(t("admin.applied"), { tone: "success" });
    } else {
      toast(t("errors.generic"), { tone: "danger" });
    }
  };

  return (
    <PushScreen>
      <ScreenHeader
        title={t("admin.title")}
        subtitle={t("admin.subtitle")}
        onBack={() => navigate("/profile")}
      />

      <div className="flex-1 overflow-y-auto pb-[calc(28px+env(safe-area-inset-bottom))] pt-3">
        {overview && (
          <div className="grid grid-cols-4 gap-2 px-4">
            <Stat label={t("admin.openCases")} value={overview.openCases} />
            <Stat label={t("admin.reportsToday")} value={overview.reportsToday} />
            <Stat label={t("admin.bannedUsers")} value={overview.bannedUsers} />
            <Stat label={t("admin.resolvedToday")} value={overview.resolvedToday} />
          </div>
        )}

        <div className="mt-4 px-4">
          <Segmented
            id="admin-tab"
            value={tab}
            onChange={setTab}
            options={[
              { value: "open" as const, label: t("admin.open") },
              { value: "resolved" as const, label: t("admin.resolved") },
            ]}
          />
        </div>

        {loading && cases.length === 0 ? (
          <div className="mt-4 space-y-2 px-4">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-[92px]" />
            ))}
          </div>
        ) : cases.length === 0 ? (
          <EmptyState
            icon={<ShieldIcon size={24} />}
            title={t("admin.empty")}
            description={t("admin.emptyHint")}
          />
        ) : (
          <m.div
            className="list-window mt-4 space-y-2.5 px-4"
            variants={listStagger}
            initial="initial"
            animate="animate"
          >
            {cases.map((item) => (
              <CaseRow key={item.id} item={item} onOpen={() => void open(item.id)} />
            ))}
          </m.div>
        )}
      </div>

      <Sheet open={detail !== null} onClose={close} title={detail?.target.anonName ?? ""}>
        {detail && (
          <div className="space-y-4 pb-2">
            <div className="flex items-center gap-3.5">
              <Avatar seed={detail.target.avatarSeed} size={54} />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-hint">
                  {t("common.level")} {detail.target.level} ·{" "}
                  {t("admin.trust", { value: detail.target.trustScore })}
                </p>
                <p className="mt-1 text-[12px] text-hint">
                  {detail.target.createdAt
                    ? t("admin.accountAge", {
                        date: new Date(detail.target.createdAt).toLocaleDateString(
                          locale === "ru" ? "ru-RU" : "en-GB",
                          { day: "numeric", month: "short", year: "numeric" },
                        ),
                      })
                    : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Chip>{t("admin.reportsCount", { count: detail.reportCount })}</Chip>
              <Chip>{t("admin.reporters", { count: detail.reporterCount })}</Chip>
              <Chip tone={detail.priority >= 1200 ? "danger" : "neutral"}>
                {t("admin.priority", { value: detail.priority })}
              </Chip>
              {detail.target.priorSanctions > 0 && (
                <Chip tone="danger">
                  {t("admin.priorSanctions", { count: detail.target.priorSanctions })}
                </Chip>
              )}
            </div>

            <div>
              <SectionHead title={t("admin.evidence")} />
              <div className="space-y-2">
                {detail.reports.slice(0, 6).map((report) => (
                  <Evidence key={report.id} report={report} />
                ))}
              </div>
            </div>

            {detail.history.length > 0 && (
              <div>
                <SectionHead title={t("admin.history")} />
                <div className="space-y-1.5">
                  {detail.history.map((entry, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-2 rounded-[12px] bg-elevated/60 px-3.5 py-2 text-[12.5px]"
                    >
                      <span className="font-display font-bold">
                        {t(`admin.actions.${entry.action}`)}
                      </span>
                      <span className="text-hint tabular">{relativeTime(entry.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              {ACTIONS.map((action) => (
                <Button
                  key={action}
                  full
                  size="sm"
                  loading={busy}
                  variant={
                    action === "dismiss"
                      ? "surface"
                      : action.startsWith("ban")
                        ? "danger"
                        : "primary"
                  }
                  onClick={() => void apply(action)}
                >
                  {t(`admin.actions.${action}`)}
                </Button>
              ))}
              {detail.target.isBanned && (
                <Button full size="sm" variant="quiet" loading={busy} onClick={() => void apply("unban")}>
                  {t("admin.actions.unban")}
                </Button>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </PushScreen>
  );
};
