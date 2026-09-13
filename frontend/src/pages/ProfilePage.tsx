import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useT } from "@/shared/i18n";
import { backgroundClass, nameEffectClass } from "@/shared/lib/cosmetics";
import { request } from "@/shared/lib/api";
import { compactNumber, durationLabel } from "@/shared/lib/format";
import { listStagger, rise, spring } from "@/shared/lib/motion";
import { haptic, openLink } from "@/shared/lib/telegram";
import type { Achievement, Profile } from "@/shared/lib/types";
import {
  Avatar,
  IconTile,
  Button,
  Chip,
  Meter,
  SectionHead,
  Sheet,
  StatTile,
  TabScreen,
} from "@/shared/ui";
import {
  BoltIcon,
  ChatIcon,
  CheckIcon,
  ChevronIcon,
  LockIcon,
  CrownIcon,
  FlameIcon,
  GamesIcon,
  HeartIcon,
  MaskIcon,
  GridIcon,
  MicIcon,
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

const DECK_HUE: Record<string, string> = {
  profile: "oklch(0.72 var(--chroma-profile) var(--hue-profile))",
  games: "oklch(0.66 var(--chroma-games) var(--hue-games))",
  search: "oklch(0.66 var(--chroma-search) var(--hue-search))",
};

const DeckTile = ({
  hue,
  icon,
  title,
  note,
  onClick,
}: {
  hue: keyof typeof DECK_HUE;
  icon: React.ReactNode;
  title: string;
  note: string;
  onClick: () => void;
}) => (
  <m.button
    type="button"
    onClick={onClick}
    onPointerDown={() => haptic.select()}
    whileTap={{ scale: 0.95 }}
    transition={spring.snappy}
    className="panel flex flex-col gap-2 rounded-[20px] px-3 py-4 text-left"
  >
    <span style={{ color: DECK_HUE[hue] }}>{icon}</span>
    <span className="font-display text-[13.5px] font-bold leading-tight">{title}</span>
    <span className="text-[11.5px] leading-tight text-hint">{note}</span>
  </m.button>
);

const QuietLink = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="rounded-full bg-elevated px-3.5 py-2 text-[12.5px] text-secondary"
  >
    {label}
  </button>
);

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
                size={68}
              />
              <div className="min-w-0 flex-1">
                <h2
                  className={`truncate font-display text-[21px] font-extrabold tracking-[-0.025em] ${
                    nameEffectClass(profile.equipped?.effect)
                  }`}
                >
                  {profile.anonName}
                </h2>
                <p className="font-display text-[11.5px] font-bold tracking-[0.01em] text-accent">
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
              <p className="mt-2 flex items-center gap-1.5 font-display text-[11px] font-bold tracking-[0.1em] text-hint tabular">
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
          {/* Three destinations instead of eight identical rows. Each says what
              it does, and colour tells them apart before the label is read. */}
          <div className="grid grid-cols-3 gap-2.5">
            <DeckTile
              hue="profile"
              icon={<MaskIcon size={22} />}
              title={t("wardrobe.title")}
              note={t("profile.deck.wardrobe")}
              onClick={() => navigate("/wardrobe")}
            />
            <DeckTile
              hue="games"
              icon={<GridIcon size={22} />}
              title={t("shop.title")}
              note={t("profile.deck.shop")}
              onClick={() => navigate("/shop")}
            />
            <DeckTile
              hue="search"
              icon={<BoltIcon size={22} />}
              title={t("profile.deck.dailyTitle")}
              note={t("profile.deck.daily")}
              onClick={() => navigate("/daily")}
            />
          </div>
        </m.section>

        {!profile.premium?.active && (
          <m.section variants={rise} className="px-4">
            <m.button
              type="button"
              onClick={() => navigate("/premium")}
              whileTap={{ scale: 0.985 }}
              transition={spring.snappy}
              className="panel flex w-full items-center gap-3.5 rounded-[20px] px-4 py-4 text-left"
            >
              <CrownIcon size={22} className="shrink-0 text-warn" />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[15px] font-bold">
                  {t("profile.getPremium")}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-hint">
                  {t("profile.premiumHint")}
                </span>
              </span>
              <ChevronIcon size={16} className="shrink-0 text-hint" />
            </m.button>
          </m.section>
        )}

        <m.section variants={rise}>
          <SectionHead title={t("profile.yourNumbers")} />
          <div className="grid grid-cols-3 gap-2 px-4">
            <StatTile
              icon={<ChatIcon size={15} />}
              value={compactNumber(stats.dialogsTotal)}
              label={t("profile.chats")}
            />
            <StatTile
              icon={<MicIcon size={15} />}
              value={durationLabel(stats.voiceSeconds)}
              label={t("profile.voice")}
              tone="live"
            />
            <StatTile
              icon={<GamesIcon size={15} />}
              value={`${stats.gamesWon}/${stats.gamesPlayed}`}
              label={t("profile.games")}
            />
            <StatTile
              icon={<HeartIcon size={15} />}
              value={compactNumber(stats.likesReceived)}
              label={t("profile.likes")}
            />
            <StatTile
              icon={<FlameIcon size={15} />}
              value={String(stats.streakDays)}
              label={t("profile.streak")}
              tone="warn"
            />
            <StatTile
              icon={<CrownIcon size={15} />}
              value={String(stats.rating)}
              label={t("profile.rating")}
              tone="accent"
            />
          </div>
        </m.section>

        <m.section variants={rise}>
          <SectionHead
            title={t("profile.achievements")}
            trailing={
              <span className="font-display text-[12px] font-bold text-hint tabular">
                {unlocked.length}/{achievements.length}
              </span>
            }
          />
          <div className="space-y-2 px-4">
            {achievements.slice(0, 8).map((item) => (
              <div
                key={item.key}
                className={`flex items-center gap-3.5 rounded-[16px] px-4 py-3 ${
                  item.unlocked ? "panel" : "quiet-panel"
                }`}
              >
                <IconTile tone={item.unlocked ? "accent" : "neutral"} size={36}>
                  {item.unlocked ? <CheckIcon size={16} /> : <LockIcon size={15} />}
                </IconTile>
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
                    <div className="mt-2">
                      <Meter ratio={item.progress / item.threshold} height={4} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </m.section>

        <m.section variants={rise} className="px-4">
          <div className="flex flex-wrap gap-2">
            <QuietLink label={t("profile.leaderboard")} onClick={() => navigate("/leaderboard")} />
            <QuietLink label={t("profile.invite")} onClick={() => void invite()} />
            <QuietLink label={t("profile.settings")} onClick={() => navigate("/settings")} />
            {isAdmin && (
              <QuietLink label={t("admin.title")} onClick={() => navigate("/admin")} />
            )}
          </div>
          <p className="px-6 pt-3 font-display text-[11px] font-bold tracking-[0.01em] text-hint">
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
    </TabScreen>
  );
};
