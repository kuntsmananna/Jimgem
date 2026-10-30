// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OrderForm } from "../OrderForm";
import { RoleProvider } from "@/components/RoleContext";
import { ProductionStagesProvider } from "@/components/ProductionStagesContext";
import { OrderTypesProvider } from "@/components/OrderTypesContext";
import { ZERO_PRICES, type Order, type ProductionStage, type Rates } from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import type { Role } from "@/lib/roles";

/**
 * The order form driven the way a person drives it — typing into the
 * fields, pressing the buttons — and checked by what it sends to the
 * server, which is the only thing about it that has to be right.
 *
 * The money math has its own tests (orderTypes); these exist for the other
 * half: that the form actually puts what was typed into the request, prices
 * it, guards a stale save and keeps the money out of a staff login's save.
 * jsdom has no layout, so nothing here is about how it looks.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const STAGES: ProductionStage[] = [
  { id: 1, key: "queue", label: "Queue", position: 0, countsAsIncome: true, isFinal: false, color: "#ddd", archivedAt: null },
  { id: 2, key: "delivered", label: "Delivered", position: 1, countsAsIncome: true, isFinal: true, color: "#eee", archivedAt: null },
];
const FLAVORS: Flavor[] = [
  { id: 1, name: "Gin & Tonic", colorGlow: "#e9f7c8", colorBase: "#9fce4f", colorShadow: "#4f7d1f", isAlcoholic: true, archivedAt: null },
];
const PACKAGES: PackageType[] = [
  { id: 1, name: "1 unit", unitsPerPackage: 1, archivedAt: null },
  { id: 2, name: "9 units", unitsPerPackage: 9, archivedAt: null },
];
// ₪10 a unit up to 100 units, exempt from VAT so the totals are plain.
const RATES: Rates = { prices: { ...ZERO_PRICES, unit_100: 10, unit_200: 9 }, displayOptions: [], deliveryOptions: [] };

const ORDER: Order = {
  key: "42",
  source: "db",
  date: "2026-11-02",
  customer: "Maya Levi",
  clientId: 7,
  customerType: "",
  location: "",
  details: "",
  guests: null,
  mirrors: null,
  displays: [],
  waitresses: null,
  kosher: false,
  packageLines: [{ packageTypeId: "2", quantity: 2, flavors: [{ flavorId: "1", units: 18 }] }],
  totalAmount: 180,
  deliveryCost: null,
  deliveryOptionId: null,
  mirrorsCost: null,
  displayCost: null,
  waitressCost: null,
  kosherCost: null,
  discount: 0,
  discountIsPercent: false,
  vatMode: "exempt",
  vatRate: 0,
  deposit: 0,
  paymentStatus: "unpaid",
  paymentMethodId: null,
  productionStatus: "queue",
  notes: "",
  needsReview: false,
  updatedAt: "2026-10-20T10:00:00.000Z",
  updatedBy: "Anna",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })) as unknown as typeof window.matchMedia;
  fetchMock = vi.fn(async (url: string) =>
    new Response(JSON.stringify(url === "/api/clients" ? { id: 99 } : { ok: true }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderForm({ order, role = "admin", onSaved = vi.fn() }: { order?: Order; role?: Role; onSaved?: () => void } = {}) {
  render(
    <RoleProvider role={role}>
      <ProductionStagesProvider stages={STAGES}>
        <OrderTypesProvider types={[]}>
          <OrderForm
            order={order}
            flavors={FLAVORS}
            packageTypes={PACKAGES}
            presets={[]}
            clients={[]}
            rates={RATES}
            onSaved={onSaved}
            onCancel={() => {}}
          />
        </OrderTypesProvider>
      </ProductionStagesProvider>
    </RoleProvider>,
  );
  return { onSaved };
}

/** The order the form sent, from the last call to the orders route. */
function sentOrder(): Record<string, unknown> & { packageLines: { packageTypeId: string; quantity: number }[] } {
  const call = fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/orders")).at(-1);
  expect(call, "the form never called the orders route").toBeTruthy();
  return JSON.parse((call![1] as RequestInit).body as string);
}

async function press(name: RegExp | string, role: "button" | "radio" = "button") {
  await act(async () => {
    fireEvent.click(screen.getAllByRole(role, { name })[0]);
  });
}

describe("adding an order", () => {
  it("will not save without a customer, and says why", async () => {
    renderForm();
    expect(screen.getByText("Add a customer name to save")).toBeTruthy();
    await press("Save order");
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/orders"))).toBe(false);
  });

  it("sends what was typed, priced at the tier, and links a new client", async () => {
    const { onSaved } = renderForm();
    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "Noa Cohen" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Haifa" } });
    await press("+ Add package");
    await press("Save order");

    const body = sentOrder();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/clients");
    expect(body.mode).toBe("replace");
    expect(body.customer).toBe("Noa Cohen");
    expect(body.location).toBe("Haifa");
    expect(body.clientId).toBe(99);
    expect(body.packageLines).toHaveLength(1);
    // Whatever the new line packs, the jelly is priced per unit at the tier.
    const line = body.packageLines[0];
    const units = line.quantity * (PACKAGES.find((p) => String(p.id) === line.packageTypeId)?.unitsPerPackage ?? 0);
    expect(units).toBeGreaterThan(0);
    expect(body.totalAmount).toBe(units * 10);
    expect(onSaved).toHaveBeenCalled();
  });

  it("stays open with the draft when the save fails", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/clients"
        ? new Response(JSON.stringify({ id: 99 }), { status: 200 })
        : new Response(JSON.stringify({ error: "The database said no." }), { status: 500 }),
    );
    const { onSaved } = renderForm();
    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "Noa Cohen" } });
    await press("Save order");
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Customer") as HTMLInputElement).value).toBe("Noa Cohen");
  });
});

describe("editing an order", () => {
  it("sends the change with the version it was opened on, so a stale save is refused", async () => {
    renderForm({ order: ORDER });
    await press("Paid in full", "radio");
    await press("Save changes");

    const call = fetchMock.mock.calls.find(([url]) => url === "/api/orders/42")!;
    expect((call[1] as RequestInit).method).toBe("PATCH");
    const body = sentOrder();
    expect(body.paymentStatus).toBe("paid");
    expect(body.expectedUpdatedAt).toBe(ORDER.updatedAt);
    // Opening an order never rewrites its agreed price.
    expect(body.totalAmount).toBe(180);
    // An order already linked to a client does not create another.
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/clients")).toBe(false);
  });

  it("does not show a staff login any money", async () => {
    renderForm({ order: { ...ORDER, totalAmount: 0 }, role: "staff" });
    expect(screen.queryByText(/₪/)).toBeNull();
  });
});
