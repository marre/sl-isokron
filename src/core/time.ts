const STOCKHOLM = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function stockholmNow(now = new Date()): { date: string; time: string } {
  const parts = Object.fromEntries(STOCKHOLM.formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}
export function validDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date + 'T12:00:00Z')) && new Date(date + 'T12:00:00Z').toISOString().startsWith(date);
}
// Enumerate the two supported Stockholm UTC offsets. Never let the browser's timezone decide.
export function stockholmInstant(date: string, time: string): number {
  if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Ange ett giltigt datum och klockslag.');
  const wall = Date.parse(`${date}T${time}:00Z`);
  const candidates = [1, 2].map(offset => wall - offset * 3600000).filter(epoch => {
    const local = stockholmNow(new Date(epoch)); return local.date === date && local.time === time;
  });
  if (candidates.length === 0) throw new Error('Klockslaget finns inte i Stockholm vid övergången till sommartid. Välj en annan tid.');
  if (candidates.length > 1) throw new Error('Klockslaget inträffar två gånger vid övergången till vintertid. Välj en entydig tid utanför 02.00–02.59.');
  return candidates[0] / 1000;
}
export function dateBounds(validFrom: string, validTo: string, now = new Date()): [string, string] {
  const today = stockholmNow(now).date;
  return [today > validFrom ? today : validFrom, addDays(today, 7) < validTo ? addDays(today, 7) : validTo];
}
export function validateDate(date: string, validFrom: string, validTo: string, now = new Date()): void {
  const [min, max] = dateBounds(validFrom, validTo, now);
  if (!validDate(date) || date < min || date > max) throw new Error(`Datum måste ligga mellan ${min} och ${max}, inom tidtabellens giltighet. Välj ett nytt datum.`);
}
