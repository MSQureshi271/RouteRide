const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatSelectedDays(days: number[]): string {
  const positions = DAY_ORDER.map((day, index) =>
    days.includes(day) ? index : -1,
  ).filter((index) => index >= 0);
  const groups: string[] = [];
  for (let i = 0; i < positions.length;) {
    let end = i;
    while (
      end + 1 < positions.length &&
      positions[end + 1] === positions[end]! + 1
    )
      end++;
    const first = DAY_NAMES[DAY_ORDER[positions[i]!]!]!;
    const last = DAY_NAMES[DAY_ORDER[positions[end]!]!]!;
    groups.push(end === i ? first : `${first}–${last}`);
    i = end + 1;
  }
  return groups.join(", ");
}
