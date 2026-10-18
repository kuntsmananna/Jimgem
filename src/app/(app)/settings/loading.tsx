import { PageLoading } from "@/components/PageLoading";

/** The jelly heap while Settings loads — see `PageLoading`. */
export default function Loading() {
  return <PageLoading label="Opening Settings…" shape="panels" />;
}
