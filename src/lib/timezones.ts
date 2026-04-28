// Shared IANA timezone list + helpers for the desktop client.

export const COMMON_TIMEZONES: string[] = [
  "Etc/UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Zurich",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Helsinki",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Tehran",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC";
  } catch {
    return "Etc/UTC";
  }
}

export function allTimezones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (kind: string) => string[] };
    const all = intl.supportedValuesOf?.("timeZone");
    if (Array.isArray(all) && all.length > 0) return all;
  } catch {
    // fall through
  }
  return COMMON_TIMEZONES;
}

export function filterTimezones(query: string): string[] {
  const q = query.trim().toLowerCase();
  const all = allTimezones();
  if (!q) {
    const seen = new Set(COMMON_TIMEZONES);
    return [...COMMON_TIMEZONES, ...all.filter((tz) => !seen.has(tz))];
  }
  return all.filter((tz) => tz.toLowerCase().includes(q));
}

export function formatTimezoneLabel(tz: string): string {
  const parts = tz.split("/");
  if (parts.length < 2) return tz;
  const region = parts[0] ?? tz;
  const city = (parts[parts.length - 1] ?? tz).replace(/_/g, " ");
  return `${city} (${region})`;
}
