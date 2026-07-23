// Every range here is built from local calendar getters (getFullYear/getMonth/
// getDate) but assembled with Date.UTC, then read back with toISOString -
// never `new Date(y, m, d)` + toISOString directly. That combination is what
// the backend date-filter bug (see PROGRESS.md, reports-pnl/reports-sales
// defaultRange()) turned out to hinge on: mixing local-timezone construction
// with a UTC read shifts the boundary by hours in whichever direction the
// local offset points. Same fix, applied here so the "quick range" buttons
// don't reintroduce it on the frontend.
function toDateString(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

export function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: toDateString(now.getFullYear(), now.getMonth(), 1),
    to: toDateString(now.getFullYear(), now.getMonth(), now.getDate()),
  };
}

export function previousMonthRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: toDateString(now.getFullYear(), now.getMonth() - 1, 1),
    // day 0 of the current month is the last day of the previous one.
    to: toDateString(now.getFullYear(), now.getMonth(), 0),
  };
}

export function currentQuarterRange(): { from: string; to: string } {
  const now = new Date();
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
  return {
    from: toDateString(now.getFullYear(), quarterStartMonth, 1),
    to: toDateString(now.getFullYear(), now.getMonth(), now.getDate()),
  };
}

export function currentYearRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: toDateString(now.getFullYear(), 0, 1),
    to: toDateString(now.getFullYear(), now.getMonth(), now.getDate()),
  };
}
