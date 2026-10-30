import { describe, expect, it } from "vitest";
import { flavorUnitCosts, formatAmount, linesFoodCost, shoppingList, type FlavorRecipe, type Ingredient } from "../foodCost";

const ing = (id: number, over: Partial<Ingredient> = {}): Ingredient => ({
  id,
  name: `I${id}`,
  unit: "ml",
  packSize: 1000,
  packPrice: 100,
  onHand: null,
  countedAt: null,
  countedBy: null,
  archivedAt: null,
  ...over,
});

// Vodka: 700 ml for ₪70 → ₪0.10/ml. Gelatin: 1000 g for ₪50 → ₪0.05/g.
const INGREDIENTS = [ing(1, { name: "Vodka", packSize: 700, packPrice: 70 }), ing(2, { name: "Gelatin", unit: "g", packPrice: 50 })];
const FLAVORS = [
  { id: 10, name: "Gin & Tonic" },
  { id: 11, name: "Berry" },
  { id: 12, name: "MIX" },
  { id: 13, name: "No recipe" },
];
// G&T: a batch of 30 takes 300 ml vodka and 60 g gelatin → 10 ml + 2 g a unit → ₪1.10.
// Berry: a batch of 10 takes 50 ml vodka and 10 g gelatin → 5 ml + 1 g a unit → ₪0.55.
const RECIPES: FlavorRecipe[] = [
  { flavorId: 10, batchUnits: 30, items: [{ ingredientId: 1, amount: 300 }, { ingredientId: 2, amount: 60 }] },
  { flavorId: 11, batchUnits: 10, items: [{ ingredientId: 1, amount: 50 }, { ingredientId: 2, amount: 10 }] },
];

describe("flavorUnitCosts", () => {
  it("prices a unit from its batch, and MIX as an even mix of the others", () => {
    const costs = flavorUnitCosts(RECIPES, INGREDIENTS, FLAVORS);
    expect(costs["10"]).toBeCloseTo(1.1);
    expect(costs["11"]).toBeCloseTo(0.55);
    expect(costs["12"]).toBeCloseTo((1.1 + 0.55) / 2);
    expect(costs["13"]).toBeUndefined();
  });

  it("leaves a flavour out when its recipe uses an ingredient it cannot price", () => {
    const costs = flavorUnitCosts([{ flavorId: 10, batchUnits: 1, items: [{ ingredientId: 99, amount: 1 }] }], INGREDIENTS, FLAVORS);
    expect(costs["10"]).toBeUndefined();
  });

  it("uses MIX's own recipe when it has one", () => {
    const own: FlavorRecipe = { flavorId: 12, batchUnits: 1, items: [{ ingredientId: 2, amount: 10 }] };
    expect(flavorUnitCosts([...RECIPES, own], INGREDIENTS, FLAVORS)["12"]).toBeCloseTo(0.5);
  });
});

describe("linesFoodCost", () => {
  const sizes = new Map([[1, 30]]);
  const costs = flavorUnitCosts(RECIPES, INGREDIENTS, FLAVORS);

  it("adds every costed unit and counts what it cannot cost", () => {
    const result = linesFoodCost(
      [
        { packageTypeId: "1", quantity: 1, flavors: [{ flavorId: "10", units: 20 }, { flavorId: "13", units: 5 }] },
        { packageTypeId: "1", quantity: 1, flavors: [{ flavorId: "11", units: 30 }] },
      ],
      sizes,
      costs,
    );
    expect(result.cost).toBeCloseTo(20 * 1.1 + 30 * 0.55);
    // 5 on a flavour with no recipe, and 5 still without a flavour.
    expect(result.uncosted).toBe(10);
  });
});

describe("shoppingList", () => {
  it("adds up what the orders need and rounds what to buy up to whole packs", () => {
    const counted = [ing(1, { name: "Vodka", packSize: 700, packPrice: 70, onHand: 1.5 }), ing(2, { name: "Gelatin", unit: "g", packPrice: 50 })];
    const { rows, untraced } = shoppingList(
      [
        { flavorId: "10", units: 90 },
        { flavorId: "13", units: 4 },
      ],
      6,
      RECIPES,
      counted,
      FLAVORS,
    );
    const vodka = rows.find((r) => r.ingredient.id === 1)!;
    expect(vodka.needed).toBeCloseTo(900);
    expect(vodka.neededPacks).toBeCloseTo(900 / 700);
    // 1.29 packs needed, 1.5 on the shelf.
    expect(vodka.toBuy).toBe(0);
    const gelatin = rows.find((r) => r.ingredient.id === 2)!;
    expect(gelatin.needed).toBeCloseTo(180);
    // Never counted, so no guess.
    expect(gelatin.toBuy).toBeNull();
    expect(untraced).toBe(10);
  });

  it("asks for a whole pack when the shelf is short by a little", () => {
    const { rows } = shoppingList(
      [{ flavorId: "10", units: 90 }],
      0,
      RECIPES,
      [ing(1, { packSize: 700, onHand: 1 }), ing(2, { unit: "g", onHand: 0 })],
      FLAVORS,
    );
    expect(rows.find((r) => r.ingredient.id === 1)!.toBuy).toBe(1);
    expect(rows.find((r) => r.ingredient.id === 2)!.toBuy).toBe(1);
  });
});

describe("formatAmount", () => {
  it("writes amounts the way a kitchen does", () => {
    expect(formatAmount(750, "ml")).toBe("750 ml");
    expect(formatAmount(1500, "ml")).toBe("1.5 L");
    expect(formatAmount(2400, "g")).toBe("2.4 kg");
    expect(formatAmount(12, "pcs")).toBe("12 pcs");
  });
});
