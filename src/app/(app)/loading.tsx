import { PageLoading } from "@/components/PageLoading";

/** The jelly heap while the Dashboard loads — see `PageLoading`. */
export default function Loading() {
  return <PageLoading label="Getting the dashboard ready…" shape="panels" />;
}
