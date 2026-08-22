import { getClientsWithStats } from "@/lib/clients";
import { getOrders, orderMonth } from "@/lib/orders";
import { getProductionStages } from "@/lib/settings";
import { isBooked, orderBalance, stageMap } from "@/lib/orderTypes";
import { MONTH_NAMES_EN } from "@/lib/financials";
import { getSumitDocuments } from "@/lib/sumitSync";
import { getVatView } from "@/lib/vatViewServer";
import { ClientsClient, type ClientOrderLine } from "@/components/clients/ClientsClient";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const vatView = await getVatView();
  const [clients, orders, stages, documents] = await Promise.all([
    getClientsWithStats(vatView),
    getOrders(),
    getProductionStages(true),
    // From the local mirror, never SUMIT: nothing on a render path calls
    // it (see sumitSync.ts).
    getSumitDocuments(),
  ]);
  const stageIndex = stageMap(stages);

  /*
   * New against returning, month by month — the one question a chart here
   * can answer that the list cannot: is the business compounding or
   * churning? An order is "new" when it is that client's first, decided
   * from the order dates rather than from when the client row was created:
   * every row was made in one migration, so their creation dates say
   * nothing about the business.
   */
  const firstOrderByClient = new Map<number, string>();
  for (const order of orders) {
    if (order.clientId === null || !order.date) continue;
    const known = firstOrderByClient.get(order.clientId);
    if (!known || order.date < known) firstOrderByClient.set(order.clientId, order.date);
  }

  const months = [...new Set(orders.map(orderMonth).filter((m): m is number => m !== null))].sort(
    (a, b) => a - b,
  );
  const newByMonth = new Map<number, number>();
  const returningByMonth = new Map<number, number>();
  for (const order of orders) {
    const month = orderMonth(order);
    if (month === null || order.clientId === null || !isBooked(order, stageIndex)) continue;
    const target = firstOrderByClient.get(order.clientId) === order.date ? newByMonth : returningByMonth;
    target.set(month, (target.get(month) ?? 0) + 1);
  }

  const lines: ClientOrderLine[] = orders
    .filter((order) => order.clientId !== null)
    .map((order) => ({
      key: order.key,
      clientId: order.clientId!,
      date: order.date,
      customer: order.customer,
      customerType: order.customerType,
      productionStatus: order.productionStatus,
      booked: isBooked(order, stageIndex),
      // What is still owed on it — the rail's Balance due, per order, so
      // the page can total what a client owes without a SUMIT round trip.
      balance: isBooked(order, stageIndex) ? orderBalance(order) : 0,
    }));

  return (
    <ClientsClient
      clients={clients}
      lines={lines}
      documents={documents.map((document) => ({
        documentId: document.documentId,
        documentNumber: document.documentNumber,
        type: document.type,
        bucket: document.bucket,
        date: document.date,
        clientId: document.clientId,
        // Gross or net, in whatever convention the nav is set to — the
        // mirror stores both, and a document with no detail yet falls back
        // to what SUMIT reported.
        value: vatView === "net" ? (document.netValue ?? document.value) : document.value,
        isClosed: document.isClosed,
        downloadUrl: document.downloadUrl,
        paymentUrl: document.paymentUrl,
      }))}
      months={months.map((month) => MONTH_NAMES_EN[month - 1])}
      newOrders={months.map((month) => newByMonth.get(month) ?? 0)}
      returningOrders={months.map((month) => returningByMonth.get(month) ?? 0)}
    />
  );
}
