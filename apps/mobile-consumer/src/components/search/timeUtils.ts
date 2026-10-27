/**
 * Time utility functions for 12-hour / 24-hour conversions.
 * Ensures error-free internal contract representations (HH:mm)
 * while presenting accessible 12-hour AM/PM formats in the UI.
 */

export interface Time12Hour {
  hour: number; // 1 - 12
  minute: number; // 0 - 59
  period: "AM" | "PM";
  formatted: string; // e.g. "08:30 AM"
}

export function to12Hour(time24: string): Time12Hour {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time24);
  if (!match) {
    return { hour: 8, minute: 30, period: "AM", formatted: "08:30 AM" };
  }

  const h = parseInt(match[1]!, 10);
  const m = parseInt(match[2]!, 10);

  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;

  const formatted = `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;

  return {
    hour: hour12,
    minute: m,
    period,
    formatted,
  };
}

export function to24Hour(
  hour12: number,
  minute: number,
  period: "AM" | "PM",
): string {
  let h24 = hour12 % 12;
  if (period === "PM") {
    h24 += 12;
  }
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatTimeDisplay(time24: string): string {
  return to12Hour(time24).formatted;
}
