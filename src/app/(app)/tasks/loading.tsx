import { PageLoading } from "@/components/PageLoading";

/** The jelly heap while the to-do list loads — see `PageLoading`. */
export default function Loading() {
  return <PageLoading label="Fetching the to-do list…" />;
}
