import { PageLoading } from "@/components/PageLoading";

/** The jelly heap while the prep sheet adds up — see `PageLoading`. */
export default function Loading() {
  return <PageLoading label="Adding up what to make…" shape="panels" />;
}
