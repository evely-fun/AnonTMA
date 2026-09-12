import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { listStagger, rise, spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  IconTile,
  SectionHead,
  Sheet,
  Skeleton,
  TabScreen,
} from "@/shared/ui";
import { DoorIcon, GamesIcon, MicIcon, PlusIcon, RoomsIcon } from "@/shared/ui/icons";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";
import { toast } from "@/store/ui";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "voice", label: "Voice" },
  { value: "game", label: "Games" },
] as const;

export const RoomsPage = () => {
  const navigate = useNavigate();
  const list = useRooms((state) => state.list);
  const loading = useRooms((state) => state.loading);
  const loadList = useRooms((state) => state.loadList);
  const create = useRooms((state) => state.create);
  const games = useSession((state) => state.games);

  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [gameKey, setGameKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadList(filter === "all" ? undefined : { kind: filter });
  }, [loadList, filter]);

  const submit = async () => {
    if (title.trim().length < 2) {
      toast("Give the room a name", { tone: "danger" });
      return;
    }
    setBusy(true);
    const room = await create({
      title: title.trim(),
      topic: topic.trim() || null,
      emoji: "",
      kind: gameKey ? "game" : "voice",
      visibility: "public",
      maxParticipants: 8,
      gameKey,
    } as never);
    setBusy(false);
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
    <TabScreen>
      <div className="space-y-6 pb-4">
        <div className="flex items-center gap-2 px-4">
          <div className="flex flex-1 gap-2">
            {FILTERS.map((item) => (
              <Chip
                key={item.value}
                active={filter === item.value}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </Chip>
            ))}
          </div>
          <Button size="sm" icon={<PlusIcon size={15} />} onClick={() => setOpen(true)}>
            Open
          </Button>
        </div>

        {loading && list.length === 0 && (
          <div className="space-y-2.5 px-4">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-[86px]" />
            ))}
          </div>
        )}

        {!loading && list.length === 0 && (
          <EmptyState
            icon={<DoorIcon size={24} />}
            title="No open rooms"
            description="Open the first table. People usually drop in within a minute."
            action={<Button onClick={() => setOpen(true)}>Open a room</Button>}
          />
        )}

        <m.div
          className="space-y-2.5 px-4"
          variants={listStagger}
          initial="initial"
          animate="animate"
        >
          {list.map((room) => {
            const game = games.find((item) => item.key === room.gameKey);
            const live = room.participants > 0;
            return (
              <m.button
                key={room.id}
                type="button"
                variants={rise}
                onPointerDown={() => haptic.select()}
                onClick={() => navigate(`/rooms/${room.id}`)}
                whileTap={{ scale: 0.985 }}
                transition={spring.snappy}
                className="panel flex w-full items-start gap-3.5 rounded-[20px] px-4 py-4 text-left"
              >
                <IconTile tone={room.gameKey ? "live" : "accent"} size={44}>
                  {room.gameKey ? <GamesIcon size={20} /> : <RoomsIcon size={20} />}
                </IconTile>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-display text-[15.5px] font-extrabold tracking-[-0.015em]">
                      {room.title}
                    </span>
                    {game && (
                      <span className="shrink-0 rounded-full bg-live-quiet px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.08em] text-live">
                        {game.title}
                      </span>
                    )}
                  </span>
                  {room.topic && (
                    <span className="mt-0.5 block truncate text-[12.5px] text-hint">
                      {room.topic}
                    </span>
                  )}
                  <span className="mt-3 flex items-center gap-2.5">
                    <span className="flex">
                      {room.members.slice(0, 4).map((member, index) => (
                        <span
                          key={member.userId}
                          style={{ marginLeft: index === 0 ? 0 : -9 }}
                          className="rounded-[8px] ring-2 ring-surface"
                        >
                          <Avatar seed={member.avatarSeed} size={22} />
                        </span>
                      ))}
                    </span>
                    <span className="font-display text-[12px] font-bold text-secondary tabular">
                      {room.participants}/{room.maxParticipants}
                    </span>
                    {live ? (
                      <span className="flex items-center gap-1 font-display text-[10.5px] font-bold uppercase tracking-[0.1em] text-live">
                        <MicIcon size={11} /> live
                      </span>
                    ) : (
                      <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.1em] text-hint">
                        quiet
                      </span>
                    )}
                  </span>
                </span>
              </m.button>
            );
          })}
        </m.div>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Open a room"
        description="Give it a name and a topic. Anyone can join a public table."
        footer={
          <Button full loading={busy} onClick={() => void submit()}>
            Create and join
          </Button>
        }
      >
        <div className="space-y-4 pb-2">
          <label className="block">
            <SectionHead title="Name" />
            <input
              className="h-[50px] w-full rounded-[16px] bg-elevated/60 px-4 text-[15px]"
              value={title}
              maxLength={64}
              placeholder="Late night talks"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label className="block">
            <SectionHead title="Topic" />
            <input
              className="h-[50px] w-full rounded-[16px] bg-elevated/60 px-4 text-[15px]"
              value={topic}
              maxLength={120}
              placeholder="Anything on your mind"
              onChange={(event) => setTopic(event.target.value)}
            />
          </label>

          <div>
            <SectionHead title="Game table" />
            <div className="flex flex-wrap gap-2">
              <Chip active={gameKey === null} onClick={() => setGameKey(null)}>
                Just voice
              </Chip>
              {games.map((game) => (
                <Chip
                  key={game.key}
                  active={gameKey === game.key}
                  onClick={() => setGameKey(game.key)}
                >
                  {game.title}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Sheet>
    </TabScreen>
  );
};
