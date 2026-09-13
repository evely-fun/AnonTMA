import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { gameCover } from "@/features/games/covers";
import { useT } from "@/shared/i18n";
import { request } from "@/shared/lib/api";
import { listStagger, rise, spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import { SectionHead, TabScreen } from "@/shared/ui";
import { FriendsIcon, MicIcon, TrophyIcon } from "@/shared/ui/icons";
import { useSession } from "@/store/session";

interface SummaryItem {
  gameKey: string;
  played: number;
  won: number;
  best: number;
}

export const GamesPage = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const games = useSession((state) => state.games);
  const [summary, setSummary] = useState<SummaryItem[]>([]);

  useEffect(() => {
    void request<{ items: SummaryItem[] }>("/games/summary")
      .then((response) => setSummary(response.items))
      .catch(() => setSummary([]));
  }, []);

  return (
    <TabScreen>
      <div className="space-y-4 pb-4">
        <SectionHead title={t("games.title")} note={t("games.note")} />

        <m.div
          className="grid grid-cols-2 gap-2.5 px-4"
          variants={listStagger}
          initial="initial"
          animate="animate"
        >
          {games.map((game, index) => {
            const cover = gameCover(game.key);
            const stats = summary.find((item) => item.gameKey === game.key);
            const played = stats?.played ?? 0;
            // An odd count leaves a hole in the last row, so the final card
            // takes the full width instead of sitting next to empty space.
            const wide = index === games.length - 1 && games.length % 2 === 1;

            return (
              <m.button
                key={game.key}
                type="button"
                variants={rise}
                onPointerDown={() => haptic.select()}
                onClick={() => navigate(`/games/${game.key}`)}
                whileTap={{ scale: 0.97 }}
                transition={spring.snappy}
                className={`relative flex flex-col overflow-hidden rounded-[22px] text-left ${
                  wide ? "col-span-2 aspect-[4/3]" : "aspect-[3/4]"
                }`}
                style={{ backgroundColor: cover.tint }}
              >
                <img
                  src={cover.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 size-full object-cover"
                />

                {/* The artwork is flat at the top and bottom, the scrims only
                    deepen it so the copy keeps its contrast on every cover. */}
                <span className="pointer-events-none absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-black/45 to-transparent" />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-t from-black/55 to-transparent" />

                <span className="relative flex flex-1 flex-col p-3">
                  <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
                    anteiku
                  </span>
                  <span className="mt-1 font-display text-[15px] font-extrabold uppercase leading-[1.05] tracking-[-0.01em] text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)]">
                    {t(`games.meta.${game.key}.title`)}
                  </span>
                  <span className="mt-1.5 self-start overflow-hidden rounded-[9px] bg-black/25 px-2 py-1 backdrop-blur-[2px]">
                    <span className="line-clamp-2 text-[10.5px] leading-tight text-white/90">
                      {t(`games.meta.${game.key}.tagline`)}
                    </span>
                  </span>

                  <span className="mt-auto flex items-center gap-1.5">
                    <span className="flex items-center gap-1 rounded-full bg-black/35 px-2 py-1 font-display text-[9.5px] font-bold text-white/90 tabular backdrop-blur-[2px]">
                      <FriendsIcon size={10} />
                      {game.minPlayers}-{game.maxPlayers}
                    </span>
                    {game.voiceRequired && (
                      <span className="flex items-center gap-1 rounded-full bg-black/35 px-2 py-1 font-display text-[9.5px] font-bold text-white/90 backdrop-blur-[2px]">
                        <MicIcon size={10} />
                        {t("games.voice")}
                      </span>
                    )}
                  </span>
                </span>

                {played > 0 && (
                  <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 font-display text-[9.5px] font-bold text-white tabular backdrop-blur-[2px]">
                    <TrophyIcon size={10} />
                    {stats?.won ?? 0}
                  </span>
                )}
              </m.button>
            );
          })}
        </m.div>
      </div>
    </TabScreen>
  );
};
