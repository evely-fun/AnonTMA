export const clockFormat = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) {
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
};

export const durationLabel = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

export const compactNumber = (value: number): string => {
  if (Math.abs(value) < 1000) {
    return String(value);
  }
  if (Math.abs(value) < 1000000) {
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  }
  return `${(value / 1000000).toFixed(1)}M`;
};

export const relativeTime = (iso: string | null): string => {
  if (!iso) {
    return "long ago";
  }
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return new Date(iso).toLocaleDateString();
};

export const activityLabel = (activity: string | null): string => {
  if (!activity) {
    return "";
  }
  if (activity.startsWith("searching")) {
    return "searching";
  }
  if (activity.startsWith("chatting")) {
    return "in a chat";
  }
  if (activity.startsWith("room")) {
    return "in a room";
  }
  if (activity === "call") {
    return "on a call";
  }
  return "online";
};
