/**
 * Money is always stored as integer minor units (PKR paisas; 1 PKR = 100 paisas).
 * This formatter uses integer arithmetic only, so output never depends on the
 * device's Intl locale data (Hermes ships partial locale data) and never goes
 * through floating point.
 */
export function formatMinorUnits(minorUnits: number, currency: string): string {
  if (!Number.isFinite(minorUnits) || !Number.isInteger(minorUnits)) {
    throw new RangeError("Money must be an integer number of minor units");
  }
  const negative = minorUnits < 0;
  const absolute = Math.abs(minorUnits);
  const major = Math.floor(absolute / 100);
  const minor = absolute % 100;
  const grouped = String(major).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = minor === 0 ? "" : `.${String(minor).padStart(2, "0")}`;
  return `${negative ? "-" : ""}${currency} ${grouped}${fraction}`;
}

/** Display form used on driver cards and profiles, e.g. "PKR 15,000 / month". */
export function formatMonthlyPrice(
  monthlyPriceMinorUnits: number,
  currency: string,
): string {
  return `${formatMinorUnits(monthlyPriceMinorUnits, currency)} / month`;
}
