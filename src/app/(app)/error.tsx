"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

// A page that failed, drawn inside the app's nav so the rest of the app is
// still a tap away. A failure in the app layout itself is caught one level
// up, by `src/app/error.tsx`.
export default function AppError(props: { error: unknown; retry: () => void }) {
  return <ErrorScreen {...props} />;
}
