import { AnimatePresence, m } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

import { useLongPress } from "@/shared/hooks/useLongPress";
import { useT } from "@/shared/i18n";
import { relativeTime } from "@/shared/lib/format";
import { listStagger, rise } from "@/shared/lib/motion";
import { openLink } from "@/shared/lib/telegram";
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  tileArt,
  IconButton,
  OptionRow,
  Panel,
  SectionHead,
  Sheet,
  TabScreen,
} from "@/shared/ui";
import { CheckIcon, CloseIcon, LinkIcon, PhoneIcon } from "@/shared/ui/icons";
import { StarMark } from "@/shared/ui/marks";
import { useSocial } from "@/store/social";
import { toast } from "@/store/ui";

const HoldRow = ({ onHold, children }: { onHold: () => void; children: ReactNode }) => {
  const press = useLongPress(onHold);
  return (
    <div {...press} className="select-none">
      {children}
    </div>
  );
};

export const FriendsPage = () => {
  const { t } = useT();
  const friends = useSocial((state) => state.friends);
  const requests = useSocial((state) => state.requests);
  const loading = useSocial((state) => state.loading);
  const load = useSocial((state) => state.load);
  const accept = useSocial((state) => state.accept);
  const decline = useSocial((state) => state.decline);
  const remove = useSocial((state) => state.remove);
  const toggleFavourite = useSocial((state) => state.toggleFavourite);
  const inviteLink = useSocial((state) => state.inviteLink);
  const callFriend = useSocial((state) => state.callFriend);
  const report = useSocial((state) => state.report);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const incoming = requests.filter((item) => item.direction === "incoming");
  const outgoing = requests.filter((item) => item.direction === "outgoing");
  const active = friends.find((friend) => friend.id === selected) ?? null;

  const invite = async () => {
    const link = await inviteLink();
    if (!link) {
      toast(t("friends.inviteFailed"), { tone: "danger" });
      return;
    }
    openLink(link.shareUrl);
  };

  return (
    <TabScreen>
      <div className="space-y-7 pb-4">
        {incoming.length > 0 && (
          <section>
            <SectionHead title={t("friends.requests")} />
            <m.div variants={listStagger} initial="initial" animate="animate">
              <Panel divided>
                <AnimatePresence initial={false}>
                  {incoming.map((item) => (
                    <m.div
                      key={item.id}
                      variants={rise}
                      exit="exit"
                      layout
                      className="flex items-center gap-3.5 px-4 py-3.5"
                    >
                      <Avatar seed={item.avatarSeed} size={42} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-[14.5px] font-bold">
                          {item.anonName}
                        </p>
                        <p className="truncate text-[12px] text-hint">
                          {item.message ?? `${t("common.level")} ${item.level}`}
                        </p>
                      </div>
                      <IconButton
                        label={t("common.done")}
                        tone="live"
                        size={36}
                        onClick={() => void accept(item.id)}
                      >
                        <CheckIcon size={16} />
                      </IconButton>
                      <IconButton
                        label={t("common.cancel")}
                        tone="danger"
                        size={36}
                        onClick={() => void decline(item.id)}
                      >
                        <CloseIcon size={15} />
                      </IconButton>
                    </m.div>
                  ))}
                </AnimatePresence>
              </Panel>
            </m.div>
          </section>
        )}

        <section>
          <SectionHead
            title={t("friends.yourCircle")}
            trailing={
              <button
                type="button"
                onClick={() => void invite()}
                className="flex items-center gap-1.5 font-display text-[13px] font-bold text-accent"
              >
                <LinkIcon size={13} />
                {t("friends.invite")}
              </button>
            }
          />

          {!loading && friends.length === 0 ? (
            <EmptyState
              art={tileArt("friends").src}
              title={t("friends.empty")}
              description={t("friends.emptyHint")}
              action={<Button onClick={() => void invite()}>{t("friends.inviteFriend")}</Button>}
            />
          ) : (
            <m.div variants={listStagger} initial="initial" animate="animate">
              <Panel divided>
                {friends.map((friend) => (
                  <m.div key={friend.id} variants={rise} layout>
                    <HoldRow onHold={() => setSelected(friend.id)}>
                    <div className="flex items-center gap-3.5 px-4 py-3.5">
                      <button type="button" onClick={() => setSelected(friend.id)}>
                        <Avatar
                          seed={friend.avatarSeed}
                          style={friend.avatarStyle}
                          frame={friend.frame}
                          size={42}
                          online={friend.isOnline}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelected(friend.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="flex items-center gap-1.5 truncate font-display text-[14.5px] font-bold">
                          {friend.alias ?? friend.anonName}
                          {friend.favourite && <StarMark size={13} />}
                        </p>
                        <p className="truncate text-[12px] text-hint">
                          {friend.isOnline
                            ? t(`friends.activity.${friend.activity ?? "online"}`)
                            : t("friends.seen", { time: relativeTime(friend.lastSeenAt) })}
                        </p>
                      </button>
                      {friend.isOnline && (
                        <IconButton
                          label={t("friends.call")}
                          tone="live"
                          size={38}
                          onClick={() => {
                            callFriend(friend.id);
                            toast(t("friends.calling"), { description: friend.anonName });
                          }}
                        >
                          <PhoneIcon size={17} />
                        </IconButton>
                      )}
                    </div>
                    </HoldRow>
                  </m.div>
                ))}
              </Panel>
            </m.div>
          )}
        </section>

        {outgoing.length > 0 && (
          <section>
            <SectionHead title={t("friends.sent")} />
            <Panel divided>
              {outgoing.map((item) => (
                <div key={item.id} className="flex items-center gap-3.5 px-4 py-3">
                  <Avatar seed={item.avatarSeed} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[14px] font-bold">{item.anonName}</p>
                    <p className="text-[11.5px] text-hint">{t("friends.waitingAnswer")}</p>
                  </div>
                  <Chip onClick={() => void decline(item.id)}>{t("common.cancel")}</Chip>
                </div>
              ))}
            </Panel>
          </section>
        )}
      </div>

      <Sheet open={active !== null} onClose={() => setSelected(null)} title={active?.anonName ?? ""}>
        {active && (
          <div className="flex flex-col items-center gap-3 pb-2">
            <Avatar
              seed={active.avatarSeed}
              style={active.avatarStyle}
              frame={active.frame}
              size={84}
              online={active.isOnline}
            />
            <p className="font-display text-[12px] font-bold tracking-[0.01em] text-hint">
              {t(`titles.${active.title}`)} · {t("common.level")} {active.level}
            </p>
            <div className="mt-4 flex w-full flex-col gap-2">
              <Button
                full
                disabled={!active.isOnline}
                icon={<PhoneIcon size={17} />}
                onClick={() => {
                  callFriend(active.id);
                  setSelected(null);
                }}
              >
                {active.isOnline ? t("friends.voiceCall") : t("friends.offline")}
              </Button>
              <OptionRow
                title={active.favourite ? t("friends.removeFavourite") : t("friends.addFavourite")}
                onClick={() => void toggleFavourite(active.id)}
              />
              <OptionRow
                title={t("moderation.report")}
                muted
                onClick={() => {
                  void report(active.id, "abuse");
                  setSelected(null);
                  toast(t("moderation.reported"));
                }}
              />
              <OptionRow
                title={t("friends.removeFriend")}
                muted
                onClick={() => {
                  void remove(active.id);
                  setSelected(null);
                }}
              />
            </div>
          </div>
        )}
      </Sheet>
    </TabScreen>
  );
};
