import { describe, expect, it } from "vitest";
import { looksLikeSameClient, namesOverlap, typedNameLooksLike } from "../clientName";

describe("looksLikeSameClient", () => {
  it("offers a longer form of the same name", () => {
    expect(looksLikeSameClient("בילדוטס", 'בילדוטס בע"מ')).toBe(true);
  });

  it("is not a near match of itself", () => {
    expect(looksLikeSameClient("Maya Levi", "maya  levi")).toBe(false);
  });

  it("compares two stored names however short", () => {
    expect(looksLikeSameClient("BK", "BK Events")).toBe(true);
  });

  it("matches at the start of a word, not inside one", () => {
    expect(looksLikeSameClient("לוי", "מאיה לוי")).toBe(true);
    expect(looksLikeSameClient("כהן", "אבי הכהני")).toBe(false);
  });
});

describe("typedNameLooksLike", () => {
  it("stays quiet until three letters are typed", () => {
    expect(typedNameLooksLike("מ", "מאיה לוי")).toBe(false);
    expect(typedNameLooksLike("מא", "מאיה לוי")).toBe(false);
    expect(typedNameLooksLike("מאי", "מאיה לוי")).toBe(true);
  });

  it("counts letters, not spaces", () => {
    expect(typedNameLooksLike("מ א", "מ אור")).toBe(false);
  });

  it("still points a long typed name at a short stored one", () => {
    expect(typedNameLooksLike("BK Events", "BK")).toBe(true);
  });
});

describe("namesOverlap", () => {
  it("suggests from the first letter, exact names included", () => {
    expect(namesOverlap("מ", "מאיה לוי")).toBe(true);
    expect(namesOverlap("Maya Levi", "Maya Levi")).toBe(true);
  });
});
