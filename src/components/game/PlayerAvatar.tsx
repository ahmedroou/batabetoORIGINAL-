import type { FC } from "react";
import { useMemo, useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  avatarId: string;
  className?: string;
  temporaryTitle?: string;
  priority?: boolean;
  /** Size in px or preset */
  size?: number | "xs" | "sm" | "md" | "lg" | "xl";
  /** Presence indicator */
  status?: "online" | "away" | "busy" | "offline";
  /** Show a subtle ring (uses ring utilities) */
  ring?: boolean;
  /** Custom ring classes, e.g. "ring-green-500/40" */
  ringClassName?: string;
  /** Soft glow around the avatar */
  glow?: boolean;
  /** Avatar shape */
  shape?: "circle" | "rounded" | "squircle";
  /** Try to use Next/Image optimization (static/public images). */
  optimize?: boolean; // default true
  /** If avatarId has no extension, this one will be appended. */
  fileExtension?: "png" | "jpg" | "jpeg" | "webp" | "svg";
  /** Extra shadow */
  showShadow?: boolean;
  /** Testing hook */
  testId?: string;
}

/**
 * Beautiful, resilient Avatar component with:
 * - Path inference for punishment vs normal avatars
 * - Optional status dot (online/away/busy/offline)
 * - Ring + glow + shape presets
 * - Graceful loading shimmer and SVG fallback if the image fails
 * - Next/Image best practices (fill + sizes)
 */
export const PlayerAvatar: FC<PlayerAvatarProps> = ({
  avatarId,
  className,
  temporaryTitle,
  priority = false,
  size = "md",
  status,
  ring = false,
  ringClassName,
  glow = false,
  shape = "circle",
  optimize = true,
  fileExtension = "png",
  showShadow = false,
  testId,
}) => {
  const isPunishmentAvatar = avatarId?.startsWith("Punish");

  const numericSize = useMemo(() => {
    if (typeof size === "number") return size;
    const map: Record<Exclude<typeof size, number>, number> = {
      xs: 28,
      sm: 36,
      md: 48,
      lg: 64,
      xl: 88,
    };
    return map[size] ?? 48;
  }, [size]);

  const resolvedSrc = useMemo(() => {
    if (!avatarId) return "";
    const hasExt = /\.[a-zA-Z0-9]+$/.test(avatarId);
    const file = hasExt ? avatarId : `${avatarId}.${fileExtension}`;
    return `${isPunishmentAvatar ? "/punishment" : "/avatars"}/${file}`;
  }, [avatarId, isPunishmentAvatar, fileExtension]);

  // Elegant inline SVG fallback (no extra assets needed)
  const fallbackSrc = useMemo(() => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'>
      <defs>
        <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0%' stop-color='${isPunishmentAvatar ? "#ef4444" : "#6366f1"}'/>
          <stop offset='100%' stop-color='${isPunishmentAvatar ? "#b91c1c" : "#0ea5e9"}'/>
        </linearGradient>
      </defs>
      <rect width='100%' height='100%' fill='url(#g)'/>
      <g fill='white' opacity='0.9'>
        <circle cx='100' cy='80' r='36'/>
        <rect x='40' y='125' rx='28' ry='28' width='120' height='50'/>
      </g>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, [isPunishmentAvatar]);

  const [src, setSrc] = useState<string>(resolvedSrc);
  const [loaded, setLoaded] = useState<boolean>(false);

  // Reset image when id changes
  if (src !== resolvedSrc && !src.startsWith("data:")) {
    // Keep TS happy while allowing a synchronous update in render path
    // (Next/Image will re-render with the new src)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    setTimeout(() => setSrc(resolvedSrc), 0);
  }

  const shapeClass = useMemo(() => {
    switch (shape) {
      case "rounded":
        return "rounded-xl";
      case "squircle":
        // Uses a squircle feel via large radius; adjust in your tailwind config if you have a plugin
        return "rounded-[28%]";
      default:
        return "rounded-full";
    }
  }, [shape]);

  const statusColor = useMemo(() => {
    switch (status) {
      case "online":
        return "bg-emerald-500";
      case "away":
        return "bg-amber-400";
      case "busy":
        return "bg-rose-500";
      default:
        return "bg-zinc-400";
    }
  }, [status]);

  return (
    <div
      className={cn(
        "relative inline-block select-none",
        glow && "drop-shadow-[0_0_12px_rgba(99,102,241,0.45)]",
        showShadow && "shadow-md",
        className
      )}
      style={{ width: numericSize, height: numericSize }}
      aria-label={`Player avatar ${avatarId}${temporaryTitle ? ", title: " + temporaryTitle : ""}`}
      data-testid={testId}
    >
      {/* Avatar ring */}
      <div
        className={cn(
          "absolute inset-0 pointer-events-none",
          ring && "ring-2",
          ring ? ringClassName ?? (isPunishmentAvatar ? "ring-red-500/40" : "ring-indigo-500/40") : undefined,
          shapeClass,
        )}
      />

      {/* Image container */}
      <div className={cn("relative w-full h-full overflow-hidden", shapeClass)}>
        {/* Shimmer while loading */}
        <div
          className={cn(
            "absolute inset-0",
            !loaded && "animate-pulse bg-gradient-to-br from-zinc-200/70 to-zinc-300/70 dark:from-zinc-800/60 dark:to-zinc-700/60"
          )}
        />

        <Image
          src={src || fallbackSrc}
          alt={`Avatar ${avatarId}`}
          fill
          sizes={`${numericSize}px`}
          className={cn("object-cover", shapeClass)}
          priority={priority}
          unoptimized={!optimize}
          onLoadingComplete={() => setLoaded(true)}
          onError={() => {
            if (!src?.startsWith("data:")) setSrc(fallbackSrc);
          }}
        />

        {/* Status dot */}
        {status && (
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-white dark:ring-zinc-900",
              statusColor
            )}
            aria-label={`status: ${status}`}
          />
        )}
      </div>

      {/* Temporary title badge */}
      {temporaryTitle && (
        <Badge
          variant={isPunishmentAvatar ? "destructive" : "default"}
          className={cn(
            "absolute -bottom-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[10px] leading-none shadow-sm",
            "whitespace-nowrap",
            "rounded-full"
          )}
        >
          {temporaryTitle}
        </Badge>
      )}
    </div>
  );
};
