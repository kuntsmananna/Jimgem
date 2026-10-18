import { PageLoading } from "@/components/PageLoading";

/** The jelly heap while the Biz Plan loads — see `PageLoading`. */
export default function Loading() {
  return <PageLoading label="Doing the sums…" shape="panels" />;
}
