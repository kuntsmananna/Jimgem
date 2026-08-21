/**
 * Clients — a placeholder, deliberately.
 *
 * The page exists so the nav can carry the link and the route stops
 * 404ing, but there is nothing to show yet: customers are free text on an
 * order (`orders.customer`), not rows of their own, so there is no client
 * to open. When they become a real record this file is where that starts.
 */
export default function ClientsPage() {
  return (
    // Fills the space the nav leaves, so the gif is centred on the page
    // rather than sitting under the header with a screen of cream below.
    <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center">
      {/*
        A plain <img>, not next/image: the optimizer re-encodes an animated
        gif to a still frame, and a page whose only content is a gif that
        doesn't move is not the page.

        Held at 512px — the source is 220px wide, so everything past ~2.3x
        is invented, and a mushy Homer is a worse joke than a smaller sharp
        one.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/not-yet.gif"
        alt="Homer Simpson in front of a hedge, captioned: not yet"
        className="w-full max-w-lg rounded-card"
      />
    </div>
  );
}
