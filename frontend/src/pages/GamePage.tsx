import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AliasBoard } from "@/features/games/AliasBoard";
import { FlappyGame } from "@/features/games/FlappyGame";
import { MafiaBoard } from "@/features/games/MafiaBoard";
import { TelephoneBoard } from "@/features/games/TelephoneBoard";
import { TicTacToeBoard } from "@/features/games/TicTacToeBoard";
import { useBackButton } from "@/shared/hooks/useBackButton";
import { request } from "@/shared/lib/api";
import { itemVariants, listVariants } from "@/shared/lib/motion";
import type { LeaderboardEntry } from "@/shared/lib/types";
import { Avatar, Button, Card, Chip, IconButton, Screen, Section } from "@/shared/ui";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";
import { toast } from "@/store/ui";

import styles from "./GamePage.module.css";

export const GamePage = () => {
  const { gameKey } = useParams();
  const navigate = useNavigate();
  const games = useSession((state) => state.games);
  const view = useGames((state) => state.view);
  const activeKey = useGames((state) => state.gameKey);
  const gameId = useGames((state) => state.gameId);
  const reward = useGames((state) => state.reward);
  const create = useGames((state) => state.create);
  const start = useGames((state) => state.start);
  const leave = useGames((state) => state.leave);
  const room = useRooms((state) => state.current);
  const members = useRooms((state) => state.members);
  const createRoom = useRooms((state) => state.create);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);

  const meta = games.find((game) => game.key === gameKey);

  useBackButton("/games");

  useEffect(() => {
    if (!gameKey) {
      return;
    }
    void request<LeaderboardEntry[]>(`/games/${gameKey}/leaderboard?limit=10`)
      .then(setBoard)
      .catch(() => setBoard([]));
  }, [gameKey]);

  if (!meta) {
    return (
      <Screen title="Game">
        <Card>
          <p className={styles.hint}>This game is not available.</p>
        </Card>
      </Screen>
    );
  }

  const playing = Boolean(gameId && activeKey === gameKey && view);
  const phase = (view?.phase as string | undefined) ?? "lobby";
  const canStartHere = room?.gameKey === gameKey && members.length >= meta.minPlayers;

  const openTable = async (): Promise<void> => {
    const created = await createRoom({
      title: `${meta.title} table`,
      emoji: meta.icon,
      kind: "game",
      visibility: "public",
      maxParticipants: meta.maxPlayers,
      gameKey: meta.key,
    } as never);
    if (created) {
      navigate(`/rooms/${created.id}`);
    } else {
      toast("Could not open a table", { tone: "danger" });
    }
  };

  const renderBoard = () => {
    if (!view) {
      return null;
    }
    switch (gameKey) {
      case "tictactoe":
        return <TicTacToeBoard view={view as never} />;
      case "mafia":
        return <MafiaBoard view={view as never} />;
      case "telephone":
        return <TelephoneBoard view={view as never} />;
      case "alias":
        return <AliasBoard view={view as never} />;
      case "flappy":
        return <FlappyGame view={view as never} />;
      default:
        return null;
    }
  };

  return (
    <Screen
      bare
      padded={false}
      title={meta.title}
      subtitle={playing ? phase : meta.subtitle}
      leading={
        <IconButton
          label="Back"
          size="sm"
          onClick={() => {
            if (playing) {
              leave();
            }
            navigate("/games");
          }}
        >
          ←
        </IconButton>
      }
    >
      <div className={styles.body}>
        {playing ? (
          <>
            {renderBoard()}
            {phase === "lobby" ? (
              <Button full onClick={start}>
                Start now
              </Button>
            ) : null}
            {phase === "finished" ? (
              <div className={styles.finishRow}>
                {reward ? (
                  <Chip tone="mint">
                    +{reward.xp ?? 0} XP · +{reward.coins ?? 0} coins
                  </Chip>
                ) : null}
                <Button
                  full
                  onClick={() => {
                    leave();
                    navigate(room ? `/rooms/${room.id}` : "/games");
                  }}
                >
                  Done
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <motion.div
            className={styles.lobby}
            variants={listVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div variants={itemVariants}>
              <Card className={styles.heroCard}>
                <span
                  className={styles.heroIcon}
                  style={{ background: `${meta.accent}22`, color: meta.accent }}
                >
                  {meta.icon}
                </span>
                <h2 className={styles.heroTitle}>{meta.title}</h2>
                <p className={styles.heroSubtitle}>{meta.subtitle}</p>
                <div className={styles.tags}>
                  <Chip size="sm">
                    {meta.minPlayers}–{meta.maxPlayers} players
                  </Chip>
                  <Chip size="sm">{meta.durationMinutes} min</Chip>
                  {meta.voiceRequired ? (
                    <Chip size="sm" tone="mint">
                      voice
                    </Chip>
                  ) : null}
                </div>
              </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Section title="How it works">
                <ul className={styles.rules}>
                  {meta.rules.map((rule, index) => (
                    <li key={index} className={styles.rule}>
                      <span className={styles.ruleIndex}>{index + 1}</span>
                      {rule}
                    </li>
                  ))}
                </ul>
              </Section>
            </motion.div>

            <motion.div variants={itemVariants} className={styles.cta}>
              {meta.key === "tictactoe" ? (
                <Button full onClick={() => create("tictactoe", { withBot: true })} icon="🤖">
                  Play against the bot
                </Button>
              ) : null}
              {canStartHere ? (
                <Button full onClick={() => create(meta.key, {}, room?.id)}>
                  Start in this room
                </Button>
              ) : (
                <Button full variant={meta.key === "tictactoe" ? "secondary" : "primary"} onClick={() => void openTable()}>
                  Open a table
                </Button>
              )}
            </motion.div>

            {board.length > 0 ? (
              <motion.div variants={itemVariants}>
                <Section title="Best players">
                  <div className={styles.board}>
                    {board.map((entry) => (
                      <div
                        key={entry.userId}
                        className={[styles.boardRow, entry.isMe ? styles.boardMe : ""]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <span className={styles.rank}>{entry.rank}</span>
                        <Avatar seed={entry.avatarSeed} size={32} />
                        <span className={styles.boardName}>{entry.anonName}</span>
                        <span className={styles.boardValue}>{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              </motion.div>
            ) : null}
          </motion.div>
        )}
      </div>
    </Screen>
  );
};
