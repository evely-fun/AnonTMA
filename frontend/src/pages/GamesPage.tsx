import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { gameVisual } from "@/features/games/visuals";
import { useT } from "@/shared/i18n";
import { request } from "@/shared/lib/api";
import { listStagger, rise, spring } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import { IconTile, SectionHead, TabScreen } from "@/shared/ui";
import { ChevronIcon, ClockIcon, FriendsIcon, MicIcon } from "@/shared/ui/icons";
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
      <div className="space-y-5 pb-4">
        <SectionHead title={t("games.title")} note={t("games.note")} />

        <m.div
          className="space-y-2.5 px-4"
          variants={listStagger}
          initial="initial"
          animate="animate"
        >
          {games.map((game) => {
            const { Icon, tone } = gameVisual(game.key);
            const stats = summary.find((item) => item.gameKey === game.key);
            return (
              <m.button
                key={game.key}
                type="button"
                variants={rise}
                onPointerDown={() => haptic.select()}
                onClick={() => navigate(`/games/${game.key}`)}
                whileTap={{ scale: 0.985 }}
                transition={spring.snappy}
                className="panel flex w-full items-center gap-3.5 rounded-[20px] px-4 py-4 text-left"
              >
                <IconTile tone={tone} size={46}>
                  <Icon size={21} />
                </IconTile>

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[15.5px] font-extrabold tracking-[-0.015em]">
                    {t(`games.meta.${game.key}.title`)}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-hint">
                    {t(`games.meta.${game.key}.subtitle`)}
                  </span>
                  <span className="mt-2.5 flex items-center gap-3 font-display text-[10.5px] font-bold uppercase tracking-[0.09em] text-hint">
                    <span className="flex items-center gap-1">
                      <FriendsIcon size={11} />
                      {game.minPlayers}-{game.maxPlayers}
                    </span>
                    <span className="flex items-center gap-1">
                      <ClockIcon size={11} />
                      {game.durationMinutes}m
                    </span>
                    {game.voiceRequired && (
                      <span className="flex items-center gap-1 text-live">
                        <MicIcon size={11} />
                        {t("games.voice")}
                      </span>
                    )}
                    {stats && stats.played > 0 && (
                      <span className="tabular">
                        {t("games.won", { won: stats.won, played: stats.played })}
                      </span>
                    )}
                  </span>
                </span>

                <ChevronIcon size={16} className="shrink-0 text-hint/60" />
              </m.button>
            );
          })}
        </m.div>
      </div>
    </TabScreen>
  );
};
