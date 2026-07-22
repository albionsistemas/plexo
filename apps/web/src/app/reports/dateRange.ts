export function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}
