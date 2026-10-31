import { formatMinorUnits, formatMonthlyPrice } from "./money";

describe("money formatting from integer minor units", () => {
  it.each([
    [0, "PKR", "PKR 0"],
    [1, "PKR", "PKR 0.01"],
    [99, "PKR", "PKR 0.99"],
    [100, "PKR", "PKR 1"],
    [1500000, "PKR", "PKR 15,000"],
    [1650050, "PKR", "PKR 16,500.50"],
    [1650005, "PKR", "PKR 16,500.05"],
    [123456789, "PKR", "PKR 1,234,567.89"],
    [100000000, "PKR", "PKR 1,000,000"],
    [250000, "USD", "USD 2,500"],
    [250099, "EUR", "EUR 2,500.99"],
    [-1650050, "PKR", "-PKR 16,500.50"],
  ])("formats %i %s as %s", (amount, currency, expected) => {
    expect(formatMinorUnits(amount, currency)).toBe(expected);
  });

  it("appends the billing period for monthly prices", () => {
    expect(formatMonthlyPrice(1650050, "PKR")).toBe("PKR 16,500.50 / month");
    expect(formatMonthlyPrice(1500000, "PKR")).toBe("PKR 15,000 / month");
  });

  it("never renders null, NaN or fractional minor units", () => {
    expect(() => formatMinorUnits(Number.NaN, "PKR")).toThrow(RangeError);
    expect(() => formatMinorUnits(Number.POSITIVE_INFINITY, "PKR")).toThrow(
      RangeError,
    );
    expect(() => formatMinorUnits(10.5, "PKR")).toThrow(RangeError);
  });
});
