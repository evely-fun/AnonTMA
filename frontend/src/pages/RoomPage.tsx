import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { listStagger, rise } from "@/shared/lib/motion";
import { Avatar, Button, IconButton, ScreenHeader, Sheet } from "@/shared/ui";
import {
  ChatIcon,
  CloseIcon,
  CrownIcon,
  HandIcon,
  MicIcon,
  MicOffIcon,
  SendIcon,
} from "@/shared/ui/icons";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";
import { useVoice } from "@/store/voice";

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

  useEffect(() => {
    const id = Number(roomId);
    if (!id) {
      navigate("/rooms");
      return;
    }
    void open(id).then(() => join(id));
    return () => leave();
  }, [roomId, open, join, leave, navigate]);

  useEffect(() => {
    if (gameId && gameKey) navigate(`/games/${gameKey}`);
  }, [gameId, gameKey, navigate]);

  const exit = () => {
    leave();
    navigate("/rooms");
  };

  const roomGame = games.find((game) => game.key === room?.gameKey);

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title={room?.title ?? "Room"}
        subtitle={room?.topic ?? `${members.length} in the room`}
        onBack={exit}
        trailing={
          <IconButton label="Room chat" size={36} onClick={() => setChatOpen(true)}>
            <ChatIcon size={16} />
          </IconButton>
        }
      />

      <div className="flex flex-1 flex-col overflow-hidden px-4 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <m.div
          className="grid flex-1 grid-cols-3 content-start gap-x-2 gap-y-6 overflow-y-auto pt-6"
          variants={listStagger}
          initial="initial"
          animate="animate"
        >
          {members.map((member) => {
            const own = member.userId === profile?.id;
            const level = own ? micLevel : (peerLevels[member.userId] ?? 0);
            const speaking = !member.muted && level > 0.12;
            return (
              <m.div
                key={member.userId}
                variants={rise}
                className="flex flex-col items-center gap-2"
              >
                <div className="relative">
                  <Avatar seed={member.avatarSeed} size={64} speaking={speaking} />
                  {member.muted && (
                    <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-bg text-hint ring-2 ring-bg">
                      <MicOffIcon size={13} />
                    </span>
                  )}
                  {member.hand && (
                    <span className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-warn text-bg">
                      <HandIcon size={13} />
                    </span>
                  )}
                </div>
                <span className="w-full truncate text-center font-display text-[12px] font-bold tracking-[-0.01em]">
                  {own ? "You" : member.anonName.split(" ").slice(0, 2).join(" ")}
                </span>
                {member.role === "host" && (
                  <span className="flex items-center gap-1 font-display text-[9.5px] font-bold uppercase tracking-[0.1em] text-warn">
                    <CrownIcon size={10} /> host
                  </span>
                )}
              </m.div>
            );
          })}

          {members.length === 0 && (
            <div className="col-span-3 flex flex-col items-center gap-3 py-16 text-center">
              <span className="flex size-14 items-center justify-center rounded-[18px] bg-elevated text-hint">
                <MicIcon size={22} />
              </span>
              <p className="text-[13.5px] text-hint">Connecting you to the table…</p>
            </div>
          )}
        </m.div>

        {roomGame && (
          <div className="panel mb-3 flex items-center justify-between gap-3 rounded-[18px] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-display text-[14px] font-extrabold tracking-[-0.01em]">
                {roomGame.title}
              </p>
              <p className="text-[11.5px] text-hint tabular">
                {members.length}/{roomGame.maxPlayers} · needs {roomGame.minPlayers}
              </p>
            </div>
            <Button
              size="sm"
              disabled={members.length < roomGame.minPlayers}
              onClick={() => createGame(roomGame.key, {}, room?.id)}
            >
              {members.length < roomGame.minPlayers ? "Waiting" : "Start"}
            </Button>
          </div>
        )}

        <div className="nav-island flex items-center justify-center gap-5 rounded-[22px] px-4 py-3">
          <IconButton
            label="Raise hand"
            tone={hand ? "accent" : "surface"}
            size={46}
            onClick={() => {
              const next = !hand;
              setHand(next);
              raiseHand(next);
            }}
          >
            <HandIcon size={19} />
          </IconButton>
          <IconButton
            label={muted ? "Unmute" : "Mute"}
            tone={muted ? "danger" : "live"}
            size={62}
            onClick={() => {
              toggleMute();
              setRoomMuted(!muted);
            }}
          >
            {muted ? <MicOffIcon size={24} /> : <MicIcon size={24} />}
          </IconButton>
          <IconButton label="Leave" tone="danger" size={46} onClick={exit}>
            <CloseIcon size={18} />
          </IconButton>
        </div>
      </div>

      <Sheet open={chatOpen} onClose={() => setChatOpen(false)} title="Room chat">
        <div className="flex max-h-[46vh] flex-col gap-2 overflow-y-auto pb-3">
          {messages.length === 0 && (
            <p className="py-10 text-center text-[13.5px] text-hint">
              No messages yet. Say something.
            </p>
          )}
          {messages.map((message) => (
            <div key={message.id} className="rounded-[14px] bg-elevated/60 px-3.5 py-2.5">
              <span className="block font-display text-[11px] font-bold uppercase tracking-[0.1em] text-accent">
                {message.anonName.split(" ")[0]}
              </span>
              <span className="mt-0.5 block break-words text-[14px]">{message.text}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-[16px] bg-elevated/60 px-4">
            <input
              className="h-[46px] w-full text-[14.5px]"
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
          </div>
          <IconButton
            label="Send"
            tone="light"
            size={46}
            onClick={() => {
              if (draft.trim()) {
                sendMessage(draft);
                setDraft("");
              }
            }}
          >
            <SendIcon size={18} />
          </IconButton>
        </div>
      </Sheet>
    </div>
  );
};
