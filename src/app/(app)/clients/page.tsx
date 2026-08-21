import { NotYet } from "@/components/clients/NotYet";

/**
 * Clients — a placeholder, deliberately.
 *
 * The page exists so the nav can carry the link and the route stops
 * 404ing, but there is nothing to show yet: customers are free text on an
 * order (`orders.customer`), not rows of their own, so there is no client
 * to open. When they become a real record this file is where that starts.
 */
export default function ClientsPage() {
  return (
    // Fills the space the nav leaves, so the gif is centred on the page
    // rather than sitting under the header with a screen of cream below.
    <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center">
      <NotYet />
    </div>
  );
}
