import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";

import { activityLabel, relativeTime } from "@/shared/lib/format";
import { listStagger, rise } from "@/shared/lib/motion";
import { openLink } from "@/shared/lib/telegram";
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  IconButton,
  Panel,
  SectionHead,
  Sheet,
  TabScreen,
} from "@/shared/ui";
import { CheckIcon, CloseIcon, FriendsIcon, LinkIcon, PhoneIcon, StarIcon } from "@/shared/ui/icons";
import { useSocial } from "@/store/social";
import { toast } from "@/store/ui";

export const FriendsPage = () => {
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
      toast("Could not build the invite link", { tone: "danger" });
      return;
    }
    openLink(link.shareUrl);
  };

  return (
    <TabScreen>
      <div className="space-y-7 pb-4">
        {incoming.length > 0 && (
          <section>
            <SectionHead title="Requests" />
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
                          {item.message ?? `Level ${item.level}`}
                        </p>
                      </div>
                      <IconButton
                        label="Accept"
                        tone="live"
                        size={36}
                        onClick={() => void accept(item.id)}
                      >
                        <CheckIcon size={16} />
                      </IconButton>
                      <IconButton
                        label="Decline"
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
            title="Your circle"
            trailing={
              <button
                type="button"
                onClick={() => void invite()}
                className="flex items-center gap-1.5 font-display text-[12px] font-bold uppercase tracking-[0.1em] text-accent"
              >
                <LinkIcon size={13} />
                invite
              </button>
            }
          />

          {!loading && friends.length === 0 ? (
            <EmptyState
              icon={<FriendsIcon size={24} />}
              title="No friends yet"
              description="Like a conversation and send a request, or invite someone from Telegram."
              action={<Button onClick={() => void invite()}>Invite a friend</Button>}
            />
          ) : (
            <m.div variants={listStagger} initial="initial" animate="animate">
              <Panel divided>
                {friends.map((friend) => (
                  <m.div key={friend.id} variants={rise} layout>
                    <div className="flex items-center gap-3.5 px-4 py-3.5">
                      <button type="button" onClick={() => setSelected(friend.id)}>
                        <Avatar seed={friend.avatarSeed} size={42} online={friend.isOnline} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelected(friend.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="flex items-center gap-1.5 truncate font-display text-[14.5px] font-bold">
                          {friend.alias ?? friend.anonName}
                          {friend.favourite && <StarIcon size={12} className="text-warn" />}
                        </p>
                        <p className="truncate text-[12px] text-hint">
                          {friend.isOnline
                            ? activityLabel(friend.activity) || "online"
                            : `seen ${relativeTime(friend.lastSeenAt)}`}
                        </p>
                      </button>
                      {friend.isOnline && (
                        <IconButton
                          label="Call"
                          tone="live"
                          size={38}
                          onClick={() => {
                            callFriend(friend.id);
                            toast("Calling…", { description: friend.anonName });
                          }}
                        >
                          <PhoneIcon size={17} />
                        </IconButton>
                      )}
                    </div>
                  </m.div>
                ))}
              </Panel>
            </m.div>
          )}
        </section>

        {outgoing.length > 0 && (
          <section>
            <SectionHead title="Sent" />
            <Panel divided>
              {outgoing.map((item) => (
                <div key={item.id} className="flex items-center gap-3.5 px-4 py-3">
                  <Avatar seed={item.avatarSeed} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[14px] font-bold">{item.anonName}</p>
                    <p className="text-[11.5px] text-hint">waiting for an answer</p>
                  </div>
                  <Chip onClick={() => void decline(item.id)}>Cancel</Chip>
                </div>
              ))}
            </Panel>
          </section>
        )}
      </div>

      <Sheet open={active !== null} onClose={() => setSelected(null)} title={active?.anonName ?? ""}>
        {active && (
          <div className="flex flex-col items-center gap-3 pb-2">
            <Avatar seed={active.avatarSeed} size={84} online={active.isOnline} />
            <p className="font-display text-[12px] font-bold uppercase tracking-[0.12em] text-hint">
              {active.title} · level {active.level}
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
                {active.isOnline ? "Voice call" : "Offline"}
              </Button>
              <Button full variant="surface" onClick={() => void toggleFavourite(active.id)}>
                {active.favourite ? "Remove from favourites" : "Add to favourites"}
              </Button>
              <Button
                full
                variant="quiet"
                onClick={() => {
                  void remove(active.id);
                  setSelected(null);
                }}
              >
                Remove friend
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </TabScreen>
  );
};
