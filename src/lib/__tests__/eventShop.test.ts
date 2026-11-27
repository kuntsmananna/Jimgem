import { describe, expect, it } from "vitest";
import { trayCubes } from "../eventPresets";
import { dealLabel } from "../eventTypes";
import { parseSaleItems } from "../validate";
import type { ContentPreset, Flavor, PackageType } from "../settings";

const flavor = (id: number, name: string, base: string): Flavor => ({
  id,
  name,
  colorGlow: `${base}-g`,
  colorBase: base,
  colorShadow: `${base}-s`,
  isAlcoholic: true,
  archivedAt: null,
});
const flavors = [flavor(1, "Lychee", "pink"), flavor(2, "Passion", "yellow"), flavor(3, "MIX", "grey")];
const packageTypes: PackageType[] = [{ id: 1, name: "9 units", unitsPerPackage: 9, archivedAt: null }];
const presets: ContentPreset[] = [
  { id: 10, name: "Lychee box", packageTypeId: 1, flavors: [{ flavorId: 1, share: 1 }], price: 42 },
  { id: 11, name: "Half and half", packageTypeId: 1, flavors: [{ flavorId: 1, share: 1 }, { flavorId: 2, share: 1 }], price: 42 },
  { id: 12, name: "Mix", packageTypeId: 1, flavors: [{ flavorId: 3, share: 1 }], price: 39 },
];
const bases = (cubes: { b: string }[]) => cubes.map((c) => c.b);

describe("trayCubes", () => {
  it("draws one cube per jelly bought, the biggest flavour first", () => {
    const cubes = trayCubes([{ presetId: 10, qty: 1 }, { presetId: 11, qty: 2 }], presets, flavors, packageTypes);
    expect(cubes).toHaveLength(27);
    expect(bases(cubes).filter((b) => b === "pink")).toHaveLength(18);
    expect(cubes[0].b).toBe("pink");
    expect(cubes.at(-1)!.b).toBe("yellow");
  });

  it("caps the tray and keeps the proportions", () => {
    const cubes = trayCubes([{ presetId: 11, qty: 10 }], presets, flavors, packageTypes, 36);
    expect(cubes).toHaveLength(36);
    expect(bases(cubes).filter((b) => b === "pink")).toHaveLength(18);
  });

  it("spreads a MIX over the other flavours", () => {
    const cubes = trayCubes([{ presetId: 12, qty: 2 }], presets, flavors, packageTypes);
    expect(bases(cubes)).not.toContain("grey");
    expect(bases(cubes).filter((b) => b === "pink")).toHaveLength(9);
  });

  it("draws nothing for a preset it cannot find", () => {
    expect(trayCubes([{ presetId: 99, qty: 1 }], presets, flavors, packageTypes)).toEqual([]);
  });
});

describe("dealLabel in Hebrew", () => {
  it("says each kind of deal", () => {
    expect(dealLabel({ kind: "bundle", minQty: 3, price: 100, percent: null, presetIds: [] }, "he")).toBe("3 ב-₪100");
    expect(dealLabel({ kind: "free", minQty: 4, price: null, percent: null, presetIds: [] }, "he")).toBe("קנו 4, קבלו 1 חינם");
    expect(dealLabel({ kind: "bundle", minQty: 3, price: 100, percent: null, presetIds: [] })).toBe("3 for ₪100");
  });
});

describe("parseSaleItems", () => {
  it("takes a basket as the shop sends it", () => {
    expect(parseSaleItems([{ presetId: 10, qty: 2 }, { presetId: "11", qty: "1" }])).toEqual([
      { presetId: 10, qty: 2 },
      { presetId: 11, qty: 1 },
    ]);
  });

  it("refuses what is not a basket", () => {
    expect(typeof parseSaleItems(null)).toBe("string");
    expect(typeof parseSaleItems([{ presetId: 10, qty: 1.5 }])).toBe("string");
    expect(typeof parseSaleItems([{ presetId: 0, qty: 1 }])).toBe("string");
    expect(typeof parseSaleItems(Array(101).fill({ presetId: 1, qty: 1 }))).toBe("string");
  });
});
