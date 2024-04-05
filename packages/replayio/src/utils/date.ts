import differenceInCalendarDays from "date-fns/differenceInCalendarDays";
import differenceInMinutes from "date-fns/differenceInMinutes";
import differenceInMonths from "date-fns/differenceInMonths";
import differenceInWeeks from "date-fns/differenceInWeeks";
import differenceInYears from "date-fns/differenceInYears";
import padStart from "lodash.padstart";
import prettyMilliseconds from "pretty-ms";

export function formatDuration(ms: number) {
  return prettyMilliseconds(ms, { millisecondsDecimalDigits: 1 });
}

export function formatRelativeDate(date: Date): string {
  const minutes = differenceInMinutes(Date.now(), date);
  const days = differenceInCalendarDays(Date.now(), date);
  const weeks = differenceInWeeks(Date.now(), date);
  const months = differenceInMonths(Date.now(), date);
  const years = differenceInYears(Date.now(), date);

  if (years > 0) {
    return `${years}y ago`;
  } else if (months > 0) {
    return `${months}mo ago`;
  } else if (weeks > 0) {
    return `${weeks}w ago`;
  } else if (days > 0) {
    return `${days}d ago`;
  } else if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  }

  return "Now";
}

export function formatTimestamp(ms: number, showHighPrecision: boolean = false) {
  const seconds = showHighPrecision ? Math.floor(ms / 1000) : Math.round(ms / 1000.0);
  const minutesString = Math.floor(seconds / 60);
  const secondsString = padStart(String(seconds % 60), 2, "0");
  if (showHighPrecision) {
    const millisecondsString = padStart(`${Math.round(ms) % 1000}`, 3, "0");
    return `${minutesString}:${secondsString}.${millisecondsString}`;
  } else {
    return `${minutesString}:${secondsString}`;
  }
}
