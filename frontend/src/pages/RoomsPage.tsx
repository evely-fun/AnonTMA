import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { itemVariants, listVariants } from "@/shared/lib/motion";
import { Avatar, Button, Card, Chip, EmptyState, Screen, Segmented, Sheet } from "@/shared/ui";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";
import { toast } from "@/store/ui";

import styles from "./RoomsPage.module.css";

const EMOJIS = ["🎧", "🌙", "☕️", "🎮", "🎬", "🎸", "💬", "🧠", "🔥", "🛸"];

export const RoomsPage = () => {
  const navigate = useNavigate();
  const list = useRooms((state) => state.list);
  const loading = useRooms((state) => state.loading);
  const loadList = useRooms((state) => state.loadList);
  const create = useRooms((state) => state.create);
  const games = useSession((state) => state.games);
  const [filter, setFilter] = useState<"all" | "voice" | "game">("all");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [emoji, setEmoji] = useState("🎧");
  const [gameKey, setGameKey] = useState<string | null>(null);

  useEffect(() => {
    void loadList(filter === "all" ? undefined : { kind: filter });
  }, [loadList, filter]);

  const submit = async (): Promise<void> => {
    if (title.trim().length < 2) {
      toast("Give the room a name", { tone: "danger" });
      return;
    }
    const room = await create({
      title: title.trim(),
      topic: topic.trim() || null,
      emoji,
      kind: gameKey ? "game" : "voice",
      visibility: "public",
      maxParticipants: 8,
      gameKey,
    } as never);
    if (!room) {
      toast("Could not create the room", { tone: "danger" });
      return;
    }
    setOpen(false);
    setTitle("");
    setTopic("");
    navigate(`/rooms/${room.id}`);
  };

  return (
    <Screen title="Rooms" subtitle="live voice tables">
      <div className={styles.controls}>
        <Segmented
          id="room-filter"
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: "all", label: "All" },
            { value: "voice", label: "Voice" },
            { value: "game", label: "Games" },
          ]}
        />
        <Button size="sm" onClick={() => setOpen(true)} icon="＋">
          New
        </Button>
      </div>

      {loading && list.length === 0 ? (
        <div className={styles.list}>
          {[0, 1, 2].map((index) => (
            <div key={index} className={[styles.skeleton, "skeleton"].join(" ")} />
          ))}
        </div>
      ) : null}

      {!loading && list.length === 0 ? (
        <EmptyState
          icon="🎧"
          title="No open rooms yet"
          description="Be the first to open a table and people will join within seconds."
          action={<Button onClick={() => setOpen(true)}>Create a room</Button>}
        />
      ) : null}

      <motion.div className={styles.list} variants={listVariants} initial="initial" animate="animate">
        {list.map((room) => (
          <motion.div key={room.id} variants={itemVariants}>
            <Card onClick={() => navigate(`/rooms/${room.id}`)}>
              <div className={styles.roomRow}>
                <span className={styles.roomEmoji}>{room.emoji}</span>
                <div className={styles.roomBody}>
                  <div className={styles.roomTitleRow}>
                    <span className={styles.roomTitle}>{room.title}</span>
                    {room.gameKey ? (
                      <Chip size="sm" tone="accent">
                        {games.find((game) => game.key === room.gameKey)?.title ?? room.gameKey}
                      </Chip>
                    ) : null}
                  </div>
                  {room.topic ? <p className={styles.roomTopic}>{room.topic}</p> : null}
                  <div className={styles.roomMeta}>
                    <span className={styles.avatars}>
                      {room.members.slice(0, 4).map((member) => (
                        <Avatar key={member.userId} seed={member.avatarSeed} size={22} />
                      ))}
                    </span>
                    <span className={styles.count}>
                      {room.participants}/{room.maxParticipants}
                    </span>
                    {room.participants > 0 ? (
                      <span className={styles.liveBadge}>live</span>
                    ) : (
                      <span className={styles.quietBadge}>quiet</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Open a room"
        description="Pick a vibe, invite friends, or let strangers drop in."
        footer={
          <Button full onClick={() => void submit()}>
            Create and join
          </Button>
        }
      >
        <div className={styles.field}>
          <label className={styles.label}>Emoji</label>
          <div className={styles.emojiRow}>
            {EMOJIS.map((item) => (
              <button
                key={item}
                type="button"
                className={[styles.emojiButton, emoji === item ? styles.emojiActive : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setEmoji(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="room-title">
            Name
          </label>
          <input
            id="room-title"
            className={styles.input}
            value={title}
            maxLength={64}
            placeholder="Late night talks"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="room-topic">
            Topic
          </label>
          <input
            id="room-topic"
            className={styles.input}
            value={topic}
            maxLength={120}
            placeholder="Anything on your mind"
            onChange={(event) => setTopic(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Game table</label>
          <div className={styles.chipRow}>
            <Chip active={gameKey === null} onClick={() => setGameKey(null)}>
              Just voice
            </Chip>
            {games.map((game) => (
              <Chip
                key={game.key}
                active={gameKey === game.key}
                onClick={() => setGameKey(game.key)}
              >
                {game.icon} {game.title}
              </Chip>
            ))}
          </div>
        </div>
      </Sheet>
    </Screen>
  );
};
