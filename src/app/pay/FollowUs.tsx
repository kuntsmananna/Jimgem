import { Globe } from "lucide-react";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, payCopy, SITE_URL, type PayLang } from "./copy";

/** Instagram's mark, drawn here: lucide no longer carries brand icons. */
export function InstagramMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

/**
 * The invitation to follow on Instagram and visit the website, at the
 * foot of a thank-you (v0.99.4, the owner's ask) — in a box of its own: a
 * thank-you first, an ask second. `title` replaces its heading where the
 * thank-you is the heading (the proof screen).
 */
export function FollowUs({ lang, title, compact = false }: { lang: PayLang; title?: string; compact?: boolean }) {
  const t = payCopy(lang);
  return (
    <div className={`motion-stagger rounded-2xl bg-cream p-4 ${compact ? "mt-4 p-3.5" : "mt-6"}`}>
      <p className="font-bold">{title ?? t.followTitle}</p>
      {/* Compact (the event thank-you): the two buttons say enough. */}
      {!compact && <p className="mt-0.5 text-sm text-ink-soft">{t.followText}</p>}
      <div className={`mt-3 gap-2 ${compact ? "grid grid-cols-2" : "flex flex-col"}`}>
        <a
          href={INSTAGRAM_URL}
          className={`press flex items-center justify-center gap-2 rounded-full bg-black font-bold text-cream ${compact ? "h-11 text-sm" : "h-12"}`}
        >
          <InstagramMark />
          <span dir="ltr">{compact ? "Instagram" : INSTAGRAM_HANDLE}</span>
        </a>
        <a
          href={SITE_URL}
          className={`press flex items-center justify-center gap-2 rounded-full border border-line bg-card font-bold text-ink ${compact ? "h-11 text-sm" : "h-12"}`}
        >
          <Globe size={17} aria-hidden />
          {t.site}
        </a>
      </div>
    </div>
  );
}
