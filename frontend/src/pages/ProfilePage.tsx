import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useT } from "@/shared/i18n";
import { backgroundClass, nameEffectClass } from "@/shared/lib/cosmetics";
import { request } from "@/shared/lib/api";
import { compactNumber, durationLabel } from "@/shared/lib/format";
import { listStagger, rise, spring } from "@/shared/lib/motion";
import { openLink } from "@/shared/lib/telegram";
import type { Achievement, Profile } from "@/shared/lib/types";
import {
  ArtTile,
  Avatar,
  Button,
  Chip,
  Meter,
  SectionHead,
  Sheet,
  StatTile,
  TabScreen,
} from "@/shared/ui";
import {
  CheckIcon,
  ChevronIcon,
  MaskIcon,
} from "@/shared/ui/icons";
import { useAdmin } from "@/store/admin";
import { useSession } from "@/store/session";
import { useSocial } from "@/store/social";
import { toast } from "@/store/ui";

const INTERESTS = [
  "music",
  "films",
  "games",
  "travel",
  "sport",
  "books",
  "tech",
  "art",
  "food",
  "science",
  "memes",
  "night talks",
];

export const ProfilePage = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const patchProfile = useSession((state) => state.patchProfile);
  const inviteLink = useSocial((state) => state.inviteLink);
  const isAdmin = useAdmin((store) => store.allowed) === true;
  const checkAdmin = useAdmin((store) => store.check);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [editing, setEditing] = useState(false);
  const [trophies, setTrophies] = useState(false);
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [gender, setGender] = useState("unknown");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void request<Achievement[]>("/users/me/achievements")
      .then(setAchievements)
      .catch(() => setAchievements([]));
  }, []);

  useEffect(() => {
    void checkAdmin();
  }, [checkAdmin]);

  useEffect(() => {
    setBio(profile?.bio ?? "");
    setInterests(profile?.interests ?? []);
    setGender(profile?.gender ?? "unknown");
  }, [profile?.bio, profile?.interests, profile?.gender]);

  if (!profile) return null;

  const stats = profile.stats;
  const progress = profile.progress;
  const unlocked = achievements.filter((item) => item.unlocked);

  const save = async () => {
    setBusy(true);
    try {
      const updated = await request<Profile>("/users/me", {
        method: "PATCH",
        body: { bio, interests, gender },
      });
      patchProfile(updated);
      setEditing(false);
      toast(t("profile.updated"), { tone: "success" });
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    const updated = await request<Profile>("/users/me", {
      method: "PATCH",
      body: { regenerateMask: true },
    });
    patchProfile(updated);
    toast(t("profile.maskGenerated"), { tone: "success", description: updated.anonName });
  };

  const invite = async () => {
    const link = await inviteLink();
    if (link) openLink(link.shareUrl);
  };

  return (
    <TabScreen>
      <m.div className="space-y-7 pb-4" variants={listStagger} initial="initial" animate="animate">
        <m.section className="px-4" variants={rise}>
          <div
            className={`panel-hero rounded-[24px] px-5 py-5 ${backgroundClass(
              profile.equipped?.background,
            )}`}
          >
            <div className="flex items-center gap-4">
              <Avatar
                seed={profile.avatarSeed}
                style={profile.equipped?.avatar}
                frame={profile.equipped?.frame}
                gender={profile.gender}
                size={68}
              />
              <div className="min-w-0 flex-1">
                <h2
                  className={`line-clamp-2 font-display text-[20px] font-extrabold leading-tight tracking-[-0.025em] ${
                    nameEffectClass(profile.equipped?.effect)
                  }`}
                >
                  {profile.anonName}
                </h2>
                <p className="mt-0.5 text-[12.5px] font-semibold text-accent">
                  {t(`titles.${progress.title}`)} · {t("common.level")} {progress.level}
                </p>
              </div>
            </div>

            {profile.bio && (
              <p className="mt-3.5 text-[13.5px] leading-snug text-secondary">{profile.bio}</p>
            )}

            <button
              type="button"
              onClick={() => navigate("/levels")}
              className="mt-4 block w-full text-left"
            >
              <Meter ratio={progress.ratio} />
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-hint tabular">
                {t("profile.xpTo", { current: progress.xpIntoLevel, total: progress.xpForNext, level: progress.level + 1 })}
                <ChevronIcon size={12} />
              </p>
            </button>

            <div className="mt-4 flex items-center gap-2">
              <Button
                size="sm"
                variant="surface"
                className="whitespace-nowrap"
                onClick={() => setEditing(true)}
              >
                {t("profile.editProfile")}
              </Button>
              <Button
                size="sm"
                variant="quiet"
                className="whitespace-nowrap"
                icon={<MaskIcon size={15} />}
                onClick={() => void regenerate()}
              >
                {t("profile.newMask")}
              </Button>
            </div>
          </div>
        </m.section>

        <m.section variants={rise} className="px-4">
          {/* Destinations are drawn, not labelled with a glyph. The picture
              carries the meaning before the word is read. */}
          <div className="grid grid-cols-3 gap-2.5">
            <ArtTile
              art="wardrobe"
              title={t("wardrobe.title")}
              onClick={() => navigate("/wardrobe")}
            />
            <ArtTile art="shop" title={t("shop.title")} onClick={() => navigate("/shop")} />
            <ArtTile
              art="rewards"
              title={t("profile.deck.dailyTitle")}
              onClick={() => navigate("/daily")}
            />
          </div>
        </m.section>

        {!profile.premium?.active && (
          <m.section variants={rise} className="px-4">
            <ArtTile
              art="premium"
              title={t("profile.getPremium")}
              note={t("profile.premiumHint")}
              onClick={() => navigate("/premium")}
              wide
            />
          </m.section>
        )}

        <m.section variants={rise}>
          <SectionHead title={t("profile.yourNumbers")} />
          <div className="grid grid-cols-3 gap-2 px-4">
            <StatTile
              art="chats"
              value={compactNumber(stats.dialogsTotal)}
              label={t("profile.chats")}
            />
            <StatTile
              art="voice"
              value={durationLabel(stats.voiceSeconds)}
              label={t("profile.voice")}
            />
            <StatTile
              art="games"
              value={`${stats.gamesWon}/${stats.gamesPlayed}`}
              label={t("profile.games")}
            />
            <StatTile
              art="likes"
              value={compactNumber(stats.likesReceived)}
              label={t("profile.likes")}
            />
            <StatTile
              art="streak"
              value={String(stats.streakDays)}
              label={t("profile.streak")}
            />
            <StatTile
              art="rating"
              value={String(stats.rating)}
              label={t("profile.rating")}
            />
          </div>
        </m.section>

        {/* Achievements are worth having but not worth eight rows of screen on
            the way to everything else. The line says how far along you are and
            the whole list is one tap away. */}
        <m.section variants={rise} className="px-4">
          <m.button
            type="button"
            onClick={() => setTrophies(true)}
            whileTap={{ scale: 0.985 }}
            transition={spring.snappy}
            className="panel flex w-full items-center gap-3.5 rounded-[20px] px-4 py-3.5 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[15px] font-bold">
                {t("profile.achievements")}
              </span>
              <span className="mt-1.5 block">
                <Meter ratio={unlocked.length / Math.max(1, achievements.length)} height={4} />
              </span>
            </span>
            <span className="shrink-0 font-display text-[13px] font-bold text-hint tabular">
              {unlocked.length}/{achievements.length}
            </span>
            <ChevronIcon size={15} className="shrink-0 text-hint" />
          </m.button>
        </m.section>

        <m.section variants={rise} className="space-y-2.5 px-4">
          <ArtTile
            art="leaderboard"
            title={t("profile.leaderboard")}
            note={t("profile.leaderboardHint")}
            onClick={() => navigate("/leaderboard")}
            wide
          />
          <ArtTile
            art="invite"
            title={t("profile.invite")}
            note={t("profile.inviteHint")}
            onClick={() => void invite()}
            wide
          />
          <ArtTile
            art="settings"
            title={t("profile.settings")}
            note={t("profile.settingsHint")}
            onClick={() => navigate("/settings")}
            wide
          />
          {isAdmin && (
            <ArtTile
              art="rooms"
              title={t("admin.title")}
              note={t("admin.subtitle")}
              onClick={() => navigate("/admin")}
              wide
            />
          )}
          <p className="px-6 pt-3 text-[12px] text-hint">
            {t("profile.version")}
          </p>
        </m.section>
      </m.div>

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title={t("profile.editProfile")}
        footer={
          <Button full loading={busy} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        }
      >
        <div className="space-y-4 pb-2">
          <div>
            <SectionHead title={t("profile.aboutYou")} />
            <textarea
              className="w-full rounded-[16px] bg-elevated/60 px-4 py-3 text-[14.5px] leading-snug"
              value={bio}
              maxLength={200}
              rows={3}
              placeholder={t("profile.aboutPlaceholder")}
              onChange={(event) => setBio(event.target.value)}
            />
          </div>
          <div>
            <SectionHead title={t("profile.gender")} note={t("profile.genderHint")} />
            <div className="flex flex-wrap gap-2 px-5">
              {[
                { value: "female", label: t("profile.female") },
                { value: "male", label: t("profile.male") },
                { value: "unknown", label: t("profile.unspecified") },
              ].map((item) => (
                <Chip
                  key={item.value}
                  active={gender === item.value}
                  onClick={() => setGender(item.value)}
                >
                  {item.label}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <SectionHead title={t("profile.interests")} note={t("profile.interestsHint")} />
            <div className="flex flex-wrap gap-2 px-5">
              {INTERESTS.map((item) => (
                <Chip
                  key={item}
                  active={interests.includes(item)}
                  onClick={() =>
                    setInterests((current) =>
                      current.includes(item)
                        ? current.filter((entry) => entry !== item)
                        : [...current, item].slice(0, 8),
                    )
                  }
                >
                  {t(`interests.${item}`)}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Sheet>
      <Sheet
        open={trophies}
        onClose={() => setTrophies(false)}
        title={t("profile.achievements")}
        description={t("profile.achievementsOf", {
          done: unlocked.length,
          total: achievements.length,
        })}
      >
        <div className="space-y-3 pb-2">
          {achievements.map((item) => (
            <div key={item.key} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate font-display text-[14px] font-bold ${
                    item.unlocked ? "text-label" : "text-secondary"
                  }`}
                >
                  {t(`achievements.${item.key}.title`)}
                </p>
                <p className="truncate text-[11.5px] text-hint">
                  {t(`achievements.${item.key}.description`)}
                </p>
                {!item.unlocked && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex-1">
                      <Meter ratio={item.progress / item.threshold} height={4} />
                    </span>
                    <span className="shrink-0 text-[11px] text-hint tabular">
                      {item.progress}/{item.threshold}
                    </span>
                  </div>
                )}
              </div>
              {item.unlocked && (
                <span className="shrink-0 text-accent">
                  <CheckIcon size={17} />
                </span>
              )}
            </div>
          ))}
        </div>
      </Sheet>
    </TabScreen>
  );
};
