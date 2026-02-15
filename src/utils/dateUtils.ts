/**
 * dateUtils.ts
 * 
 * Central utility for handling date and time formatting across the app.
 * Inputs are expected to be ISO 8601 strings (UTC).
 * Outputs are formatted strings in the user's local timezone.
 */

export function formatMatchTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatMatchDate(dateString: string): string {
    const date = new Date(dateString);
    // e.g. "Sat 12 May" -> "Sat 12 May" in en-GB
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatFullDateTime(dateString: string): string {
    return `${formatMatchDate(dateString)} ${formatMatchTime(dateString)}`;
}

export function isSameDay(d1: string, d2: string): boolean {
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    return date1.toDateString() === date2.toDateString();
}
