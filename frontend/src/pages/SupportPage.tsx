import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";

import { useBackButton } from "@/shared/hooks/useBackButton";
import { useT } from "@/shared/i18n";
import { listStagger, rise } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import {
  Button,
  Chip,
  Panel,
  PushScreen,
  ScreenHeader,
  Segmented,
  Sheet,
  Skeleton,
} from "@/shared/ui";
import type { TicketCard, TicketTopic } from "@/store/support";
import { useSupport } from "@/store/support";

const TOPICS: TicketTopic[] = ["technical", "shop", "app", "game", "report"];

const STATE_TONE: Record<string, "live" | "accent" | undefined> = {
  open: "accent",
  answered: "live",
  closed: undefined,
};

export const SupportPage = () => {
  const { t } = useT();
  const {
    mine,
    queue,
    thread,
    canHandle,
    loading,
    busy,
    load,
    loadQueue,
    open,
    close,
    create,
    reply,
    resolve,
  } = useSupport();
  const [tab, setTab] = useState<"mine" | "queue">("mine");
  const [composing, setComposing] = useState(false);
  const [topic, setTopic] = useState<TicketTopic>("app");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [answer, setAnswer] = useState("");

  useBackButton("/settings");

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (canHandle.length > 0) void loadQueue();
  }, [canHandle, loadQueue]);

  const isStaff = canHandle.length > 0;
  const list = tab === "queue" ? queue : mine;

  const card = (ticket: TicketCard) => (
    <m.button
      key={ticket.id}
      type="button"
      variants={rise}
      onClick={() => {
        haptic.select();
        void open(ticket.id);
      }}
      className="panel flex w-full items-center gap-3 rounded-[18px] px-4 py-3.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14px] font-semibold">{ticket.subject}</span>
          {ticket.unread && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
        </span>
        <span className="mt-0.5 block text-[12.5px] text-hint">
          {t(`support.topic.${ticket.topic}`)}
        </span>
      </span>
      <Chip tone={STATE_TONE[ticket.state]}>{t(`support.state.${ticket.state}`)}</Chip>
    </m.button>
  );

  return (
    <PushScreen>
      <ScreenHeader
        title={t("support.title")}
        subtitle={t("support.subtitle")}
        onBack={() => history.back()}
      />

      <div className="flex-1 overflow-y-auto pb-[calc(24px+env(safe-area-inset-bottom))] pt-4">
        {isStaff && (
          <div className="px-4">
            <Segmented
              id="support-tab"
              value={tab}
              onChange={setTab}
              options={[
                { value: "mine", label: t("support.mine") },
                { value: "queue", label: t("support.queue") },
              ]}
            />
          </div>
        )}

        <m.div
          className="mt-4 flex flex-col gap-2 px-4"
          variants={listStagger}
          initial="initial"
          animate="animate"
        >
          {loading && list.length === 0 ? (
            <>
              <Skeleton className="h-[70px] rounded-[18px]" />
              <Skeleton className="h-[70px] rounded-[18px]" />
            </>
          ) : list.length === 0 ? (
            <Panel className="mx-0 px-4 py-6 text-center">
              <p className="text-[13.5px] text-hint">
                {tab === "queue" ? t("support.queueEmpty") : t("support.empty")}
              </p>
            </Panel>
          ) : (
            <AnimatePresence initial={false}>{list.map(card)}</AnimatePresence>
          )}
        </m.div>

        {tab === "mine" && (
          <div className="mt-4 px-4">
            <Button full onClick={() => setComposing(true)}>
              {t("support.newTicket")}
            </Button>
          </div>
        )}
      </div>

      {/* A new ticket is a topic and a sentence. The topic is what decides who
          reads it, so it is the first thing asked, not a dropdown at the end. */}
      <Sheet open={composing} onClose={() => setComposing(false)} title={t("support.newTicket")}>
        <div className="space-y-3 pb-2">
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTopic(value)}
                className={`rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
                  topic === value ? "bg-accent text-on-accent" : "bg-elevated text-secondary"
                }`}
              >
                {t(`support.topic.${value}`)}
              </button>
            ))}
          </div>
          <p className="text-[12px] leading-snug text-hint">{t(`support.hint.${topic}`)}</p>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value.slice(0, 120))}
            placeholder={t("support.subjectPlaceholder")}
            className="w-full rounded-[16px] bg-elevated px-4 py-3 text-[14px] outline-none"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, 2000))}
            placeholder={t("support.bodyPlaceholder")}
            rows={5}
            className="w-full resize-none rounded-[16px] bg-elevated px-4 py-3 text-[14px] outline-none"
          />
          <Button
            full
            loading={busy}
            disabled={body.trim().length < 5}
            onClick={async () => {
              if (await create(topic, subject, body)) {
                setSubject("");
                setBody("");
                setComposing(false);
              }
            }}
          >
            {t("support.send")}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={thread !== null}
        onClose={close}
        title={thread?.subject ?? t("support.title")}
      >
        {thread && (
          <div className="space-y-3 pb-2">
            <div className="flex items-center gap-2">
              <Chip>{t(`support.topic.${thread.topic}`)}</Chip>
              <Chip tone={STATE_TONE[thread.state]}>{t(`support.state.${thread.state}`)}</Chip>
            </div>

            <div className="flex max-h-[46vh] flex-col gap-2 overflow-y-auto">
              {thread.messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded-[16px] px-3.5 py-2.5 text-[13.5px] leading-snug ${
                    message.mine
                      ? "self-end bg-accent text-on-accent"
                      : "self-start bg-elevated text-label"
                  }`}
                >
                  {!message.mine && message.fromStaff && (
                    <span className="mb-1 block text-[11px] font-semibold opacity-70">
                      {t("support.fromStaff")}
                    </span>
                  )}
                  {message.body}
                </div>
              ))}
            </div>

            {thread.state !== "closed" && (
              <>
                <textarea
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value.slice(0, 2000))}
                  placeholder={t("support.replyPlaceholder")}
                  rows={3}
                  className="w-full resize-none rounded-[16px] bg-elevated px-4 py-3 text-[14px] outline-none"
                />
                <div className="flex gap-2">
                  <Button
                    full
                    variant="surface"
                    onClick={() => void resolve(thread.id)}
                  >
                    {t("support.closeTicket")}
                  </Button>
                  <Button
                    full
                    loading={busy}
                    disabled={answer.trim().length === 0}
                    onClick={async () => {
                      if (await reply(thread.id, answer)) setAnswer("");
                    }}
                  >
                    {t("support.send")}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>
    </PushScreen>
  );
};
