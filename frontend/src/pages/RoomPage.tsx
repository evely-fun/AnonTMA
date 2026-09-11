import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useBackButton } from "@/shared/hooks/useBackButton";
import { itemVariants, listVariants } from "@/shared/lib/motion";
import { Avatar, Button, Card, Chip, IconButton, Screen, Sheet } from "@/shared/ui";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";
import { useVoice } from "@/store/voice";

import styles from "./RoomPage.module.css";

export const RoomPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const room = useRooms((state) => state.current);
  const members = useRooms((state) => state.members);
  const messages = useRooms((state) => state.messages);
  const open = useRooms((state) => state.open);
  const join = useRooms((state) => state.join);
  const leave = useRooms((state) => state.leave);
  const sendMessage = useRooms((state) => state.sendMessage);
  const setRoomMuted = useRooms((state) => state.setMuted);
  const raiseHand = useRooms((state) => state.raiseHand);

  const profile = useSession((state) => state.profile);
  const games = useSession((state) => state.games);
  const muted = useVoice((state) => state.muted);
  const micLevel = useVoice((state) => state.micLevel);
  const peerLevels = useVoice((state) => state.peerLevels);
  const toggleMute = useVoice((state) => state.toggleMute);
  const createGame = useGames((state) => state.create);
  const gameId = useGames((state) => state.gameId);
  const gameKey = useGames((state) => state.gameKey);

  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [hand, setHand] = useState(false);

  useBackButton("/rooms");

  useEffect(() => {
    const id = Number(roomId);
    if (!id) {
      navigate("/rooms");
      return;
    }
    void open(id).then(() => join(id));
    return () => {
      leave();
    };
  }, [roomId, open, join, leave, navigate]);

  useEffect(() => {
    if (gameId && gameKey) {
      navigate(`/games/${gameKey}`);
    }
  }, [gameId, gameKey, navigate]);

  const exit = (): void => {
    leave();
    navigate("/rooms");
  };

  const toggleHand = (): void => {
    const next = !hand;
    setHand(next);
    raiseHand(next);
  };

  const onMute = (): void => {
    toggleMute();
    setRoomMuted(!muted);
  };

  const roomGame = games.find((game) => game.key === room?.gameKey);

  return (
    <Screen
      bare
      padded={false}
      title={room?.title ?? "Room"}
      subtitle={room?.topic ?? `${members.length} in the room`}
      leading={
        <IconButton label="Leave" size="sm" onClick={exit}>
          ←
        </IconButton>
      }
      trailing={
        <IconButton label="Room chat" size="sm" onClick={() => setChatOpen(true)}>
          💬
        </IconButton>
      }
    >
      <div className={styles.body}>
        <motion.div className={styles.grid} variants={listVariants} initial="initial" animate="animate">
          {members.map((member) => {
            const own = member.userId === profile?.id;
            const level = own ? micLevel : (peerLevels[member.userId] ?? 0);
            const speaking = !member.muted && level > 0.12;
            return (
              <motion.div key={member.userId} variants={itemVariants} className={styles.seat}>
                <Avatar
                  seed={member.avatarSeed}
                  size={66}
                  speaking={speaking}
                  ring={member.role === "host"}
                  level={member.level}
                />
                <span className={styles.seatName}>
                  {own ? "You" : member.anonName.split(" ").slice(0, 2).join(" ")}
                </span>
                <div className={styles.seatBadges}>
                  {member.muted ? <span className={styles.badge}>🔇</span> : null}
                  {member.hand ? <span className={styles.badge}>✋</span> : null}
                  {member.role === "host" ? <span className={styles.badgeHost}>host</span> : null}
                </div>
              </motion.div>
            );
          })}
          {members.length === 0 ? (
            <Card className={styles.waiting}>
              <span className={styles.waitingIcon}>🎧</span>
              <p className={styles.waitingText}>Connecting you to the table…</p>
            </Card>
          ) : null}
        </motion.div>

        {roomGame ? (
          <Card className={styles.gameCard}>
            <div className={styles.gameInfo}>
              <span className={styles.gameIcon}>{roomGame.icon}</span>
              <div>
                <p className={styles.gameTitle}>{roomGame.title}</p>
                <p className={styles.gameHint}>
                  {roomGame.minPlayers}–{roomGame.maxPlayers} players · {roomGame.durationMinutes} min
                </p>
              </div>
            </div>
            <Button
              size="sm"
              disabled={members.length < roomGame.minPlayers}
              onClick={() => createGame(roomGame.key, {}, room?.id)}
            >
              {members.length < roomGame.minPlayers ? "Waiting" : "Start"}
            </Button>
          </Card>
        ) : null}

        <div className={styles.dock}>
          <IconButton label="Raise hand" tone={hand ? "accent" : "neutral"} onClick={toggleHand}>
            ✋
          </IconButton>
          <IconButton
            label={muted ? "Unmute" : "Mute"}
            tone={muted ? "danger" : "success"}
            size="lg"
            onClick={onMute}
          >
            {muted ? "🔇" : "🎙"}
          </IconButton>
          <IconButton label="Leave" tone="danger" onClick={exit}>
            ✕
          </IconButton>
        </div>
      </div>

      <Sheet open={chatOpen} onClose={() => setChatOpen(false)} title="Room chat">
        <div className={[styles.chatList, "scroller"].join(" ")}>
          {messages.length === 0 ? (
            <p className={styles.chatEmpty}>No messages yet. Say something.</p>
          ) : null}
          {messages.map((message) => (
            <div key={message.id} className={styles.chatItem}>
              <span className={styles.chatAuthor}>{message.anonName.split(" ")[0]}</span>
              <span className={styles.chatText}>{message.text}</span>
            </div>
          ))}
        </div>
        <div className={styles.chatComposer}>
          <input
            className={styles.chatInput}
            value={draft}
            maxLength={600}
            placeholder="Write to the room"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && draft.trim()) {
                sendMessage(draft);
                setDraft("");
              }
            }}
          />
          <Chip
            tone="accent"
            onClick={() => {
              if (draft.trim()) {
                sendMessage(draft);
                setDraft("");
              }
            }}
          >
            Send
          </Chip>
        </div>
      </Sheet>
    </Screen>
  );
};
