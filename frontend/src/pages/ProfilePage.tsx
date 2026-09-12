import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useT } from "@/shared/i18n";
import { request } from "@/shared/lib/api";
import { compactNumber, durationLabel } from "@/shared/lib/format";
import { listStagger, rise } from "@/shared/lib/motion";
import { openLink } from "@/shared/lib/telegram";
import type { Achievement, Profile } from "@/shared/lib/types";
import {
  Avatar,
  Button,
  Chip,
  IconTile,
  ListRow,
  Meter,
  Panel,
  SectionHead,
  Sheet,
  StatTile,
  TabScreen,
} from "@/shared/ui";
import {
  BoltIcon,
  ChatIcon,
  CheckIcon,
  LockIcon,
  CrownIcon,
  FlameIcon,
  GamesIcon,
  HeartIcon,
  LinkIcon,
  MaskIcon,
  GridIcon,
  MicIcon,
  SettingsIcon,
  ShieldIcon,
} from "@/shared/ui/icons";
import { useAdmin } from "@/store/admin";
import { useEconomy } from "@/store/economy";
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

const NAME_EFFECT: Record<string, string> = {
  none: "",
  gradient:
    "bg-[linear-gradient(100deg,var(--color-accent),var(--color-live))] bg-clip-text text-transparent",
  glow: "text-accent drop-shadow-[0_0_10px_var(--accent-soft)]",
  aurora:
    "bg-[linear-gradient(100deg,var(--color-accent),var(--color-warn),var(--color-live))] bg-clip-text text-transparent",
};

export const ProfilePage = () => {
  const { t, locale } = useT();
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const patchProfile = useSession((state) => state.patchProfile);
  const inviteLink = useSocial((state) => state.inviteLink);
  const economy = useEconomy((store) => store.state);
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
          <div className="panel-hero rounded-[24px] px-5 py-5">
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
                    NAME_EFFECT[profile.equipped?.effect ?? "none"] ?? ""
                  }`}
                >
                  {profile.anonName}
                </h2>
                <p className="font-display text-[11.5px] font-bold uppercase tracking-[0.12em] text-accent">
                  {t(`titles.${progress.title}`)} · {t("common.level")} {progress.level}
                </p>
              </div>
            </div>

            {profile.bio && (
              <p className="mt-3.5 text-[13.5px] leading-snug text-secondary">{profile.bio}</p>
            )}

            <div className="mt-4">
              <Meter ratio={progress.ratio} />
              <p className="mt-2 font-display text-[11px] font-bold uppercase tracking-[0.1em] text-hint tabular">
                {t("profile.xpTo", { current: progress.xpIntoLevel, total: progress.xpForNext, level: progress.level + 1 })}
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="surface" onClick={() => setEditing(true)}>
                {t("profile.editProfile")}
              </Button>
              <Button
                size="sm"
                variant="quiet"
                icon={<MaskIcon size={15} />}
                onClick={() => void regenerate()}
              >
                {t("profile.newMask")}
              </Button>
            </div>
          </div>
        </m.section>

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

        <m.section variants={rise}>
          <Panel divided>
            <ListRow
              leading={
                <IconTile tone="warn">
                  <CrownIcon size={18} />
                </IconTile>
              }
              title={
                profile.premium?.active
                  ? t("profile.premiumActive", {
                      date: profile.premium.until
                        ? new Date(profile.premium.until).toLocaleDateString(
                            locale === "ru" ? "ru-RU" : "en-GB",
                            { day: "numeric", month: "short" },
                          )
                        : "",
                    })
                  : t("profile.getPremium")
              }
              subtitle={t("profile.premiumHint")}
              chevron
              onClick={() => navigate("/premium")}
            />
            <ListRow
              leading={
                <IconTile tone="accent">
                  <BoltIcon size={18} />
                </IconTile>
              }
              title={t("economy.dailyTitle")}
              subtitle={
                economy?.unlimited
                  ? t("economy.unlimited")
                  : `${economy?.energy ?? 0} / ${economy?.energyMax ?? 0} ${t("common.energy")}`
              }
              chevron
              onClick={() => navigate("/daily")}
            />
            <ListRow
              leading={
                <IconTile tone="live">
                  <LinkIcon size={18} />
                </IconTile>
              }
              title={t("profile.invite")}
              subtitle={t("profile.inviteHint")}
              chevron
              onClick={() => void invite()}
            />
            <ListRow
              leading={
                <IconTile>
                  <CrownIcon size={18} />
                </IconTile>
              }
              title={t("profile.leaderboard")}
              subtitle={t("profile.leaderboardHint")}
              chevron
              onClick={() => navigate("/leaderboard")}
            />
            <ListRow
              leading={
                <IconTile tone="warn">
                  <GridIcon size={18} />
                </IconTile>
              }
              title={t("shop.title")}
              subtitle={t("shop.hint")}
              chevron
              onClick={() => navigate("/shop")}
            />
            {isAdmin && (
              <ListRow
                leading={
                  <IconTile tone="danger">
                    <ShieldIcon size={18} />
                  </IconTile>
                }
                title={t("admin.title")}
                subtitle={t("admin.subtitle")}
                chevron
                onClick={() => navigate("/admin")}
              />
            )}
            <ListRow
              leading={
                <IconTile>
                  <SettingsIcon size={18} />
                </IconTile>
              }
              title={t("profile.settings")}
              subtitle={t("profile.settingsHint")}
              chevron
              onClick={() => navigate("/settings")}
            />
          </Panel>
          <p className="px-6 pt-3 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-hint">
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
