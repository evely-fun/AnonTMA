interface NavIconProps {
  size?: number;
  /** The active tab is drawn solid, the rest keep their outline. */
  filled?: boolean;
  className?: string;
}

/**
 * The five tab marks, drawn here rather than borrowed from an icon set.
 *
 * Every one exists in two states cut from the same outline: a stroke for the
 * tab you are not on, and the same shape filled for the one you are. Nothing
 * moves between the states except the fill, so the row reads as one family and
 * the current tab is the only bright thing in it.
 */
const frame = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  className,
});

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Find: the carnival mask the whole product is named after. */
export const FindMark = ({ size = 20, filled, className }: NavIconProps) => (
  <svg {...frame(size, className)}>
    <path
      d="M3.4 8.9c0-1.3 1-2.3 2.3-2.2 1.6.1 3.9.4 6.3.4s4.7-.3 6.3-.4c1.3-.1 2.3.9 2.3 2.2 0 2-.5 3.9-1.6 5.4-.8 1.1-2 1.8-3.3 1.8-1.6 0-2.6-.9-3.2-1.9-.2-.3-.6-.3-.8 0-.6 1-1.6 1.9-3.2 1.9-1.3 0-2.5-.7-3.3-1.8-1.1-1.5-1.8-3.4-1.8-5.4Z"
      {...stroke}
      fill={filled ? "currentColor" : "none"}
    />
    {filled ? (
      <>
        <circle cx="7.7" cy="10.6" r="1.25" fill="var(--bar-solid)" />
        <circle cx="16.3" cy="10.6" r="1.25" fill="var(--bar-solid)" />
      </>
    ) : (
      <>
        <circle cx="7.7" cy="10.6" r="1.1" fill="currentColor" />
        <circle cx="16.3" cy="10.6" r="1.1" fill="currentColor" />
      </>
    )}
  </svg>
);

/** Rooms: a voice going out in rings. */
export const RoomsMark = ({ size = 20, filled, className }: NavIconProps) => (
  <svg {...frame(size, className)}>
    <circle cx="12" cy="12" r="3" {...stroke} fill={filled ? "currentColor" : "none"} />
    <path d="M7.2 7.2a6.8 6.8 0 0 0 0 9.6" {...stroke} opacity={filled ? 1 : 0.75} />
    <path d="M16.8 16.8a6.8 6.8 0 0 0 0-9.6" {...stroke} opacity={filled ? 1 : 0.75} />
    <path d="M4.4 4.4a10.7 10.7 0 0 0 0 15.2" {...stroke} opacity={filled ? 0.8 : 0.45} />
    <path d="M19.6 19.6a10.7 10.7 0 0 0 0-15.2" {...stroke} opacity={filled ? 0.8 : 0.45} />
  </svg>
);

/** Play: a pad squashed down to two sticks and a cross. */
export const PlayMark = ({ size = 20, filled, className }: NavIconProps) => (
  <svg {...frame(size, className)}>
    <path
      d="M7.6 7h8.8c1.7 0 3.1 1.2 3.4 2.9l.7 4.3c.3 1.8-1.1 3.4-2.9 3.4-.9 0-1.7-.4-2.2-1.1l-.8-1H9.4l-.8 1c-.5.7-1.3 1.1-2.2 1.1-1.8 0-3.2-1.6-2.9-3.4l.7-4.3C4.5 8.2 5.9 7 7.6 7Z"
      {...stroke}
      fill={filled ? "currentColor" : "none"}
    />
    <path
      d="M8.4 11.6v2M7.4 12.6h2"
      stroke={filled ? "var(--bar-solid)" : "currentColor"}
      strokeWidth={1.7}
      strokeLinecap="round"
    />
    <circle cx="15.6" cy="12.6" r="1.05" fill={filled ? "var(--bar-solid)" : "currentColor"} />
  </svg>
);

/** Friends: two of them, one a step behind. */
export const FriendsMark = ({ size = 20, filled, className }: NavIconProps) => (
  <svg {...frame(size, className)}>
    <circle cx="9.6" cy="8.6" r="3.1" {...stroke} fill={filled ? "currentColor" : "none"} />
    <path
      d="M3.6 18.4c0-2.7 2.7-4.6 6-4.6s6 1.9 6 4.6"
      {...stroke}
      fill={filled ? "currentColor" : "none"}
    />
    <path d="M16.4 6.2a3.1 3.1 0 0 1 0 5.6" {...stroke} opacity={filled ? 1 : 0.7} />
    <path d="M17.6 14.4c1.7.6 2.8 1.9 2.8 3.6" {...stroke} opacity={filled ? 1 : 0.7} />
  </svg>
);

/** Profile: you, inside the ring the app draws round everyone. */
export const ProfileMark = ({ size = 20, filled, className }: NavIconProps) => (
  <svg {...frame(size, className)}>
    <circle cx="12" cy="12" r="9" {...stroke} fill={filled ? "currentColor" : "none"} />
    <circle
      cx="12"
      cy="9.7"
      r="2.9"
      {...stroke}
      stroke={filled ? "var(--bar-solid)" : "currentColor"}
      fill="none"
    />
    <path
      d="M6.4 18.9c1-2.2 3.1-3.5 5.6-3.5s4.6 1.3 5.6 3.5"
      {...stroke}
      stroke={filled ? "var(--bar-solid)" : "currentColor"}
    />
  </svg>
);
