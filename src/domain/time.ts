const TIME_ZONE = "Europe/Riga";

export function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(iso));
}
