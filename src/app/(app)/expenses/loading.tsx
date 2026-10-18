import { PageLoading } from "@/components/PageLoading";

/** The jelly heap while Expenses loads — see `PageLoading`. */
export default function Loading() {
  return <PageLoading label="Adding up the expenses…" />;
}
