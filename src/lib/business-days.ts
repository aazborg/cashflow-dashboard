/**
 * Bestimmt, ob das übergebene Datum der zweitletzte Werktag (Mo–Fr) des
 * Monats ist. Berücksichtigt keine österreichischen Feiertage — bei Bedarf
 * nachschärfen, indem ein "isHoliday(date)"-Helper in die Schleife
 * eingehängt wird.
 */
export function isSecondToLastWorkingDayOfMonth(now: Date): boolean {
  const target = secondToLastWorkingDayOfMonth(now);
  return (
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate()
  );
}

export function secondToLastWorkingDayOfMonth(refDate: Date): Date {
  const lastOfMonth = new Date(
    refDate.getFullYear(),
    refDate.getMonth() + 1,
    0,
  );
  const cursor = new Date(lastOfMonth);
  const workingDays: Date[] = [];
  while (workingDays.length < 2) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) workingDays.push(new Date(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return workingDays[1];
}

const MONTH_NAMES_DE = [
  "Jänner",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function monthLabelDe(month: string): string {
  const [yearStr, monStr] = month.split("-");
  const m = Number.parseInt(monStr, 10);
  if (!yearStr || Number.isNaN(m) || m < 1 || m > 12) return month;
  return `${MONTH_NAMES_DE[m - 1]} ${yearStr}`;
}
