import { describe, expect, it } from "vitest";
import { LIMITS, isThrottled } from "../loginThrottle";

describe("isThrottled", () => {
  it("lets a few mistypes through", () => {
    expect(isThrottled({ nameAndAddress: LIMITS.nameAndAddress - 1, address: 4, name: 4 })).toBe(false);
  });

  it("stops one name from one address after the fifth failure", () => {
    expect(isThrottled({ nameAndAddress: LIMITS.nameAndAddress, address: 5, name: 5 })).toBe(true);
  });

  it("stops one address working down a list of names", () => {
    expect(isThrottled({ nameAndAddress: 1, address: LIMITS.address, name: 1 })).toBe(true);
  });

  it("stops one name guessed from many addresses, but only past a high bar", () => {
    expect(isThrottled({ nameAndAddress: 1, address: 1, name: LIMITS.name - 1 })).toBe(false);
    expect(isThrottled({ nameAndAddress: 1, address: 1, name: LIMITS.name })).toBe(true);
  });
});
