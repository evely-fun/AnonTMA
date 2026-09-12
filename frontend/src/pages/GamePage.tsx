import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AliasBoard } from "@/features/games/AliasBoard";
import { FlappyGame } from "@/features/games/FlappyGame";
import { MafiaBoard } from "@/features/games/MafiaBoard";
import { TelephoneBoard } from "@/features/games/TelephoneBoard";
import { TicTacToeBoard } from "@/features/games/TicTacToeBoard";
import { gameVisual } from "@/features/games/visuals";
import { request } from "@/shared/lib/api";
import { listStagger, rise } from "@/shared/lib/motion";
import type { LeaderboardEntry } from "@/shared/lib/types";
import { Avatar, Button, Chip, IconTile, Panel, ScreenHeader, SectionHead } from "@/shared/ui";
import { ClockIcon, FriendsIcon, MicIcon } from "@/shared/ui/icons";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";
import { toast } from "@/store/ui";

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

  useEffect(() => {
    if (!gameKey) return;
    void request<LeaderboardEntry[]>(`/games/${gameKey}/leaderboard?limit=8`)
      .then(setBoard)
      .catch(() => setBoard([]));
  }, [gameKey]);

  if (!meta) {
    return (
      <div className="flex h-full flex-col">
        <ScreenHeader title="Game" onBack={() => navigate("/games")} />
        <p className="px-5 pt-6 text-[13.5px] text-hint">This game is not available.</p>
      </div>
    );
  }

  const { Icon, tone } = gameVisual(meta.key);
  const playing = Boolean(gameId && activeKey === gameKey && view);
  const phase = (view?.phase as string | undefined) ?? "lobby";
  const canStartHere = room?.gameKey === gameKey && members.length >= meta.minPlayers;

  const openTable = async () => {
    const created = await createRoom({
      title: `${meta.title} table`,
      emoji: "",
      kind: "game",
      visibility: "public",
      maxParticipants: meta.maxPlayers,
      gameKey: meta.key,
    } as never);
    if (created) navigate(`/rooms/${created.id}`);
    else toast("Could not open a table", { tone: "danger" });
  };

  const renderBoard = () => {
    if (!view) return null;
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
    <div className="flex h-full flex-col">
      <ScreenHeader
        title={meta.title}
        subtitle={playing ? phase : meta.subtitle}
        onBack={() => {
          if (playing) leave();
          navigate("/games");
        }}
      />

      <div className="flex flex-1 flex-col overflow-y-auto pb-[calc(18px+env(safe-area-inset-bottom))]">
        {playing ? (
          <div className="flex flex-1 flex-col gap-4 px-4 pt-3">
            {renderBoard()}
            {phase === "lobby" && (
              <Button full onClick={start}>
                Start now
              </Button>
            )}
            {phase === "finished" && (
              <div className="flex flex-col items-center gap-3">
                {reward && (
                  <Chip tone="live">
                    +{reward.xp ?? 0} XP · +{reward.coins ?? 0} coins
                  </Chip>
                )}
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
            )}
          </div>
        ) : (
          <m.div
            className="space-y-7 pt-4"
            variants={listStagger}
            initial="initial"
            animate="animate"
          >
            <m.div className="px-4" variants={rise}>
              <div className="panel-hero flex flex-col items-center gap-2 rounded-[24px] px-5 py-7 text-center">
                <IconTile tone={tone} size={64}>
                  <Icon size={30} />
                </IconTile>
                <h2 className="mt-2 font-display text-[22px] font-extrabold tracking-[-0.025em]">
                  {meta.title}
                </h2>
                <p className="max-w-[290px] text-[13.5px] leading-snug text-secondary">
                  {meta.subtitle}
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <Chip>
                    <FriendsIcon size={12} />
                    {meta.minPlayers}-{meta.maxPlayers} players
                  </Chip>
                  <Chip>
                    <ClockIcon size={12} />
                    {meta.durationMinutes} min
                  </Chip>
                  {meta.voiceRequired && (
                    <Chip tone="live">
                      <MicIcon size={12} />
                      voice
                    </Chip>
                  )}
                </div>
              </div>
            </m.div>

            <m.section variants={rise}>
              <SectionHead title="How it works" />
              <div className="space-y-2 px-4">
                {meta.rules.map((rule, index) => (
                  <div
                    key={index}
                    className="panel flex items-start gap-3 rounded-[16px] px-4 py-3.5"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-quiet font-display text-[11px] font-extrabold text-accent">
                      {index + 1}
                    </span>
                    <span className="text-[13.5px] leading-snug text-secondary">{rule}</span>
                  </div>
                ))}
              </div>
            </m.section>

            <m.div className="flex flex-col gap-2 px-4" variants={rise}>
              {meta.key === "tictactoe" && (
                <Button full onClick={() => create("tictactoe", { withBot: true })}>
                  Play against the bot
                </Button>
              )}
              {canStartHere ? (
                <Button full onClick={() => create(meta.key, {}, room?.id)}>
                  Start in this room
                </Button>
              ) : (
                <Button
                  full
                  variant={meta.key === "tictactoe" ? "surface" : "primary"}
                  onClick={() => void openTable()}
                >
                  Open a table
                </Button>
              )}
            </m.div>

            {board.length > 0 && (
              <m.section variants={rise}>
                <SectionHead title="Best players" />
                <Panel divided>
                  {board.map((entry) => (
                    <div
                      key={entry.userId}
                      className={`flex items-center gap-3 px-4 py-3 ${
                        entry.isMe ? "bg-accent-quiet" : ""
                      }`}
                    >
                      <span className="w-5 text-center font-display text-[12px] font-extrabold text-hint tabular">
                        {entry.rank}
                      </span>
                      <Avatar seed={entry.avatarSeed} size={32} />
                      <span className="min-w-0 flex-1 truncate font-display text-[14px] font-bold">
                        {entry.anonName}
                      </span>
                      <span className="font-display text-[14px] font-extrabold tabular">
                        {entry.value}
                      </span>
                    </div>
                  ))}
                </Panel>
              </m.section>
            )}
          </m.div>
        )}
      </div>
    </div>
  );
};
