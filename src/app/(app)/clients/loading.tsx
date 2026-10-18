import { PageLoading } from "@/components/PageLoading";

/** The jelly heap while Clients loads — see `PageLoading`. */
export default function Loading() {
  return <PageLoading label="Gathering your clients…" />;
}
