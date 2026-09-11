import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { activityLabel, relativeTime } from "@/shared/lib/format";
import { itemVariants, listVariants } from "@/shared/lib/motion";
import { openLink } from "@/shared/lib/telegram";
import { Avatar, Button, Card, Chip, EmptyState, IconButton, Screen, Section, Sheet } from "@/shared/ui";
import { useSocial } from "@/store/social";
import { toast } from "@/store/ui";

import styles from "./FriendsPage.module.css";

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

  const invite = async (): Promise<void> => {
    const link = await inviteLink();
    if (!link) {
      toast("Could not build the invite link", { tone: "danger" });
      return;
    }
    openLink(link.shareUrl);
  };

  return (
    <Screen title="Friends" subtitle={`${friends.filter((item) => item.isOnline).length} online`}>
      {incoming.length > 0 ? (
        <Section title="Requests">
          <motion.div className={styles.list} variants={listVariants} initial="initial" animate="animate">
            <AnimatePresence initial={false}>
              {incoming.map((item) => (
                <motion.div key={item.id} variants={itemVariants} exit="exit" layout>
                  <Card>
                    <div className={styles.row}>
                      <Avatar seed={item.avatarSeed} size={44} level={item.level} />
                      <div className={styles.rowBody}>
                        <span className={styles.name}>{item.anonName}</span>
                        {item.message ? <span className={styles.note}>{item.message}</span> : null}
                      </div>
                      <div className={styles.rowActions}>
                        <IconButton
                          label="Accept"
                          tone="success"
                          size="sm"
                          onClick={() => void accept(item.id)}
                        >
                          ✓
                        </IconButton>
                        <IconButton
                          label="Decline"
                          tone="danger"
                          size="sm"
                          onClick={() => void decline(item.id)}
                        >
                          ✕
                        </IconButton>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </Section>
      ) : null}

      <Section
        title="Your circle"
        action={
          <Chip size="sm" tone="accent" onClick={() => void invite()}>
            Invite
          </Chip>
        }
      >
        {!loading && friends.length === 0 ? (
          <EmptyState
            icon="🤝"
            title="No friends yet"
            description="Like a conversation and send a request, or invite someone from Telegram."
            action={<Button onClick={() => void invite()}>Invite a friend</Button>}
          />
        ) : null}

        <motion.div className={styles.list} variants={listVariants} initial="initial" animate="animate">
          {friends.map((friend) => (
            <motion.div key={friend.id} variants={itemVariants} layout>
              <Card onClick={() => setSelected(friend.id)}>
                <div className={styles.row}>
                  <Avatar seed={friend.avatarSeed} size={44} online={friend.isOnline} level={friend.level} />
                  <div className={styles.rowBody}>
                    <span className={styles.name}>
                      {friend.alias ?? friend.anonName}
                      {friend.favourite ? " ★" : ""}
                    </span>
                    <span className={styles.note}>
                      {friend.isOnline
                        ? activityLabel(friend.activity) || "online"
                        : `seen ${relativeTime(friend.lastSeenAt)}`}
                    </span>
                  </div>
                  {friend.isOnline ? (
                    <IconButton
                      label="Call"
                      tone="success"
                      size="sm"
                      onClick={() => {
                        callFriend(friend.id);
                        toast("Calling…", { icon: "📞" });
                      }}
                    >
                      📞
                    </IconButton>
                  ) : null}
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {outgoing.length > 0 ? (
        <Section title="Sent">
          <div className={styles.list}>
            {outgoing.map((item) => (
              <Card key={item.id}>
                <div className={styles.row}>
                  <Avatar seed={item.avatarSeed} size={36} />
                  <div className={styles.rowBody}>
                    <span className={styles.name}>{item.anonName}</span>
                    <span className={styles.note}>waiting for an answer</span>
                  </div>
                  <Chip size="sm" onClick={() => void decline(item.id)}>
                    Cancel
                  </Chip>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      <Sheet open={active !== null} onClose={() => setSelected(null)} title={active?.anonName ?? ""}>
        {active ? (
          <div className={styles.detail}>
            <Avatar seed={active.avatarSeed} size={88} online={active.isOnline} level={active.level} />
            <p className={styles.detailTitle}>{active.title}</p>
            <div className={styles.detailActions}>
              <Button
                full
                onClick={() => {
                  callFriend(active.id);
                  setSelected(null);
                }}
                icon="📞"
                disabled={!active.isOnline}
              >
                {active.isOnline ? "Voice call" : "Offline"}
              </Button>
              <Button full variant="secondary" onClick={() => void toggleFavourite(active.id)}>
                {active.favourite ? "Remove from favourites" : "Add to favourites"}
              </Button>
              <Button
                full
                variant="ghost"
                onClick={() => {
                  void remove(active.id);
                  setSelected(null);
                }}
              >
                Remove friend
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </Screen>
  );
};
