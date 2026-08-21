"use client";

import { useState } from "react";

/**
 * The Clients page's entire contents.
 *
 * A Client Component only so a missing file degrades into words rather
 * than a browser's broken-image glyph: the gif is dropped into `public/`
 * by hand, and a placeholder page that itself looks broken is worse than
 * no page at all.
 */
export function NotYet() {
  const [missing, setMissing] = useState(false);

  if (missing) {
    return (
      <p className="font-display text-[64px] leading-none font-extrabold tracking-tight text-ink/15 uppercase">
        Not yet
      </p>
    );
  }

  /*
   * A plain <img>, not next/image: the optimizer re-encodes an animated
   * gif to a still frame, and a page whose only content is a gif that
   * doesn't move is not the page.
   */
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/not-yet.gif"
      alt="Homer Simpson in front of a hedge, captioned: not yet"
      /*
       * Both, because either one alone misses a case. A file that isn't
       * there fails while the server-rendered HTML is still being
       * hydrated, so `onError` has no handler attached yet and the event
       * is lost; the ref runs after mount and asks the element what
       * happened (`complete` with no `naturalWidth` is a load that
       * failed). `onError` then covers a request that is still in flight
       * at that point.
       */
      ref={(el) => {
        if (el?.complete && el.naturalWidth === 0) setMissing(true);
      }}
      onError={() => setMissing(true)}
      /*
       * 512px, not larger. The source is 220x165 — every pixel past
       * ~2.3x is invented, and a mushy Homer is a worse joke than a
       * slightly smaller sharp one.
       */
      className="w-full max-w-lg rounded-card"
    />
  );
}
