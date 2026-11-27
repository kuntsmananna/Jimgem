import { PageLoading } from "@/components/PageLoading";

/** The jelly heap while the events load — see `PageLoading`. */
export default function Loading() {
  return <PageLoading label="Fetching the events…" />;
}
