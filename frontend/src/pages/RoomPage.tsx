import { m } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AudioSheet } from "@/features/voice/AudioSheet";
import { useLongPress } from "@/shared/hooks/useLongPress";
import { useT } from "@/shared/i18n";
import { listStagger, spring } from "@/shared/lib/motion";
import { Avatar, Button, IconButton, OptionRow, PushScreen, ScreenHeader, Sheet } from "@/shared/ui";
import {
  ChatIcon,
  CloseIcon,
  CrownIcon,
  HandIcon,
  MicIcon,
  MicOffIcon,
  SendIcon,
  SlidersIcon,
} from "@/shared/ui/icons";
import { HandMark } from "@/shared/ui/marks";
import { useGames } from "@/store/games";
import { PersonSheet, type Person } from "@/features/moderation/PersonSheet";
import { EntranceOverlay } from "@/features/rooms/EntranceOverlay";
import { useRooms } from "@/store/rooms";
import { useSocial } from "@/store/social";
import { toast } from "@/store/ui";
import { useSession } from "@/store/session";
import { useVoice } from "@/store/voice";


const MemberTile = ({
  own,
  speaking,
  onHold,
  children,
}: {
  own: boolean;
  speaking: boolean;
  onHold: () => void;
  children: ReactNode;
}) => {
  const press = useLongPress(onHold);
  return (
    <m.div
      {...(own ? {} : press)}
      // An explicit animate object opts the element out of the parent's
      // variant, so combining the two left every tile stuck at the variant's
      // initial opacity of zero and the room looked empty.
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, scale: speaking ? 1.03 : 1 }}
      transition={spring.snappy}
      className="flex select-none flex-col items-center gap-2"
    >
      {children}
    </m.div>
  );
};

export const RoomPage = () => {
  const { t } = useT();
  const { roomId } = useParams();
  const navigate = useNavigate();

  const room = useRooms((state) => state.current);
  const members = useRooms((state) => state.members);
  const arrival = useRooms((state) => state.arrival);
  const clearArrival = useRooms((state) => state.clearArrival);
  const messages = useRooms((state) => state.messages);
  const open = useRooms((state) => state.open);
  const join = useRooms((state) => state.join);
  const leave = useRooms((state) => state.leave);
  const sendMessage = useRooms((state) => state.sendMessage);
  const setRoomMuted = useRooms((state) => state.setMuted);
  const raiseHand = useRooms((state) => state.raiseHand);
  const moderate = useRooms((state) => state.moderate);
  const kicked = useRooms((state) => state.kicked);
  const reset = useRooms((state) => state.reset);
  const reportMember = useRooms((state) => state.reportMember);
  const addFriend = useSocial((state) => state.sendRequest);

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
  const [audioOpen, setAudioOpen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [person, setPerson] = useState<Person | null>(null);

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

  useEffect(() => {
    if (kicked) {
      reset();
      navigate("/rooms", { replace: true });
    }
  }, [kicked, reset, navigate]);

  const exit = () => {
    leave();
    navigate("/rooms");
  };

  const roomGame = games.find((game) => game.key === room?.gameKey);
  const target = useMemo(
    () => members.find((member) => member.userId === picked) ?? null,
    [members, picked],
  );
  const self = members.find((member) => member.userId === profile?.id);
  const isHost = self?.role === "host";
  const canModerate = isHost || self?.role === "cohost";

  const act = (action: string) => {
    if (!target) return;
    moderate(target.userId, action);
    setPicked(null);
  };

  return (
    <PushScreen>
      <ScreenHeader
        title={room?.title ?? t("nav.rooms")}
        subtitle={room?.topic ?? t("rooms.inRoom", { count: members.length })}
        onBack={exit}
        trailing={
          <IconButton label={t("rooms.roomChat")} size={36} onClick={() => setChatOpen(true)}>
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
              <MemberTile
                key={member.userId}
                own={own}
                speaking={speaking}
                onHold={() => !own && setPicked(member.userId)}
              >
                <div className="relative">
                  <Avatar
                    seed={member.avatarSeed}
                    style={member.avatarStyle}
                    frame={member.frame}
                    size={64}
                    speaking={speaking}
                  />
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
                  {own ? t("common.you") : member.anonName.split(" ").slice(0, 2).join(" ")}
                </span>
                {member.role !== "member" && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-warn">
                    <CrownIcon size={10} />{" "}
                    {member.role === "host" ? t("rooms.host") : t("moderation.cohost")}
                  </span>
                )}
              </MemberTile>
            );
          })}

          {members.length === 0 && (
            <div className="col-span-3 flex flex-col items-center gap-3 py-16 text-center">
              <span className="flex size-14 items-center justify-center rounded-[18px] bg-elevated text-hint">
                <MicIcon size={22} />
              </span>
              <p className="text-[13.5px] text-hint">{t("rooms.connecting")}</p>
            </div>
          )}
        </m.div>

        {roomGame && (
          <div className="panel mb-3 flex items-center justify-between gap-3 rounded-[18px] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-display text-[14px] font-extrabold tracking-[-0.01em]">
                {t(`games.meta.${roomGame.key}.title`)}
              </p>
              <p className="text-[11.5px] text-hint tabular">
                {members.length}/{roomGame.maxPlayers} ·{" "}
                {t("rooms.needs", { count: roomGame.minPlayers })}
              </p>
            </div>
            <Button
              size="sm"
              disabled={members.length < roomGame.minPlayers}
              onClick={() => createGame(roomGame.key, {}, room?.id)}
            >
              {members.length < roomGame.minPlayers ? t("rooms.waiting") : t("common.start")}
            </Button>
          </div>
        )}

        <div className="nav-island flex items-center justify-center gap-4 rounded-[22px] px-4 py-3">
          <IconButton
            label={t("rooms.raiseHand")}
            tone={hand ? "accent" : "surface"}
            size={46}
            onClick={() => {
              const next = !hand;
              setHand(next);
              raiseHand(next);
            }}
          >
            <HandMark size={20} />
          </IconButton>
          <IconButton
            label={muted ? t("chat.unmute") : t("chat.mute")}
            tone={muted ? "danger" : "live"}
            size={62}
            onClick={() => {
              toggleMute();
              setRoomMuted(!muted);
            }}
          >
            {muted ? <MicOffIcon size={24} /> : <MicIcon size={24} />}
          </IconButton>
          <IconButton
            label={t("chat.audioSettings")}
            size={46}
            onClick={() => setAudioOpen(true)}
          >
            <SlidersIcon size={19} />
          </IconButton>
          <IconButton label={t("rooms.leave")} tone="danger" size={46} onClick={exit}>
            <CloseIcon size={18} />
          </IconButton>
        </div>
      </div>

      <Sheet open={chatOpen} onClose={() => setChatOpen(false)} title={t("rooms.roomChat")}>
        <div className="flex max-h-[46vh] flex-col gap-2 overflow-y-auto pb-3">
          {messages.length === 0 && (
            <p className="py-10 text-center text-[13.5px] text-hint">
              {t("rooms.noMessages")}
            </p>
          )}
          {messages.map((message) => (
            <div key={message.id} className="rounded-[14px] bg-elevated/60 px-3.5 py-2.5">
              <span className="block text-[12px] font-semibold text-accent">
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
              placeholder={t("rooms.writeToRoom")}
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


      <Sheet
        open={target !== null}
        onClose={() => setPicked(null)}
        title={target?.anonName ?? ""}
        description={
          target
            ? t(`moderation.${target.role === "host" ? "host" : target.role === "cohost" ? "cohost" : "member"}`)
            : undefined
        }
      >
        <div className="flex flex-col gap-2 pb-2">
          {canModerate && target && target.role !== "host" && (
            <>
              <OptionRow
                title={target.forcedMute ? t("moderation.unmute") : t("moderation.mute")}
                onClick={() => act(target.forcedMute ? "unmute" : "mute")}
              />
              {isHost && (
                <OptionRow
                  title={
                    target.role === "cohost" ? t("moderation.demote") : t("moderation.promote")
                  }
                  onClick={() => act(target.role === "cohost" ? "demote" : "promote")}
                />
              )}
              {isHost && (
                <OptionRow title={t("moderation.transfer")} onClick={() => act("transfer")} />
              )}
              <OptionRow title={t("moderation.kick")} muted onClick={() => act("kick")} />
            </>
          )}
          <OptionRow
            title={t("moderation.addFriend")}
            onClick={() => {
              if (!target) return;
              void addFriend(target.userId);
              setPicked(null);
              toast(t("friends.sent"));
            }}
          />
          <OptionRow
            title={t("moderation.aboutPerson")}
            subtitle={t("moderation.aboutPersonHint")}
            onClick={() => {
              if (!target) return;
              setPerson({
                userId: target.userId,
                anonName: target.anonName,
                avatarSeed: target.avatarSeed,
              });
              setPicked(null);
            }}
          />
        </div>
      </Sheet>

      <PersonSheet
        person={person}
        onClose={() => setPerson(null)}
        onReport={(userId) => {
          reportMember(userId, "abuse");
          toast(t("moderation.reported"));
        }}
      />

      <AudioSheet open={audioOpen} onClose={() => setAudioOpen(false)} />
      <EntranceOverlay arrival={arrival} onDone={clearArrival} />
    </PushScreen>
  );
};
