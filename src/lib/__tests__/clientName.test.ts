import { describe, expect, it } from "vitest";
import { looksLikeSameClient } from "../clientName";

describe("looksLikeSameClient", () => {
  it("offers a longer form of the same name", () => {
    expect(looksLikeSameClient("בילדוטס", 'בילדוטס בע"מ')).toBe(true);
  });

  it("stays quiet until three letters are typed", () => {
    expect(looksLikeSameClient("מ", "מאיה לוי")).toBe(false);
    expect(looksLikeSameClient("מא", "מאיה לוי")).toBe(false);
    expect(looksLikeSameClient("מאי", "מאיה לוי")).toBe(true);
  });
});
