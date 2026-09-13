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

                {/* The cover is the pitch, so nothing sits on top of it. The
                    words live in a band at the bottom over a single scrim, and
                    the illustration above it is never covered by a floating
                    box of translucent grey. */}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/80 via-black/45 to-transparent" />

                <span className="relative mt-auto flex flex-col p-3">
                  <span className="font-display text-[16px] font-extrabold leading-[1.05] tracking-[-0.015em] text-white">
                    {t(`games.meta.${game.key}.title`)}
                  </span>
                  <span className="mt-1 line-clamp-2 text-[11.5px] leading-tight text-white/80">
                    {t(`games.meta.${game.key}.tagline`)}
                  </span>
                  <span className="flex items-center gap-1.5 pt-2">
                    <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10.5px] font-semibold text-white tabular">
                      <FriendsIcon size={10} />
                      {game.minPlayers}-{game.maxPlayers}
                    </span>
                    {game.voiceRequired && (
                      <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10.5px] font-semibold text-white">
                        <MicIcon size={10} />
                        {t("games.voice")}
                      </span>
                    )}
                  </span>
                </span>

                {played > 0 && (
                  <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] font-semibold text-white tabular">
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
