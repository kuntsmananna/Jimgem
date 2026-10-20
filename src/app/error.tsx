"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

// The app layout's own failures — it reads the session, the role and two
// lists before any page draws — land here, inside the root layout's fonts
// and styles but without a nav, since the nav is what failed to render.
export default function RootError(props: { error: unknown; retry: () => void }) {
  return (
    <main className="px-6 py-8 max-md:px-4">
      <ErrorScreen {...props} />
    </main>
  );
}
