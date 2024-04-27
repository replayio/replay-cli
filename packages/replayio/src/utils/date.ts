export function getRelativeDate({
  daysAgo,
  hoursAgo,
  minutesAgo,
  monthsAgo,
  secondsAgo,
  weeksAgo,
  yearsAgo,
}: {
  daysAgo?: number;
  hoursAgo?: number;
  minutesAgo?: number;
  monthsAgo?: number;
  secondsAgo?: number;
  weeksAgo?: number;
  yearsAgo?: number;
}) {
  const date = new Date();

  if (yearsAgo !== undefined) {
    date.setTime(date.getTime() - 1000 * 60 * 60 * 24 * 356 * yearsAgo);
  }

  if (monthsAgo !== undefined) {
    date.setTime(date.getTime() - 1000 * 60 * 60 * 24 * 30 * monthsAgo);
  }

  if (weeksAgo !== undefined) {
    date.setTime(date.getTime() - 1000 * 60 * 60 * 24 * 7 * weeksAgo);
  }

  if (daysAgo !== undefined) {
    date.setTime(date.getTime() - 1000 * 60 * 60 * 24 * daysAgo);
  }

  if (hoursAgo !== undefined) {
    date.setTime(date.getTime() - 1000 * 60 * 60 * hoursAgo);
  }

  if (minutesAgo !== undefined) {
    date.setTime(date.getTime() - 1000 * 60 * minutesAgo);
  }

  if (secondsAgo !== undefined) {
    date.setTime(date.getTime() - 1000 * secondsAgo);
  }

  return date;
}

export function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 356);

  if (years > 0) {
    return years === 1 ? "1 year" : `${years} years`;
  } else if (months > 0) {
    return months === 1 ? "1 month" : `${months} months`;
  } else if (weeks > 0) {
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  } else if (days > 0) {
    return days === 1 ? "1 day" : `${days} days`;
  } else if (hours > 0) {
    return hours === 1 ? "1 hour" : `${hours} hours`;
  } else if (minutes > 0) {
    return minutes === 1 ? "1 min" : `${minutes} mins`;
  } else if (seconds > 0) {
    return seconds === 1 ? "1 sec" : `${seconds} secs`;
  }

  return "0sec";
}

export function formatRelativeDate(date: Date): string {
  const ms = Date.now() - date.getTime();
  if (ms < 1000) {
    return "now";
  }

  return formatDuration(ms) + " ago";
}

export function formatTimestamp(ms: number, showHighPrecision: boolean = false) {
  const seconds = showHighPrecision ? Math.floor(ms / 1000) : Math.round(ms / 1000.0);
  const minutesString = Math.floor(seconds / 60);
  const secondsString = String(seconds % 60).padStart(2, "0");
  if (showHighPrecision) {
    const millisecondsString = `${Math.round(ms) % 1000}`.padStart(3, "0");
    return `${minutesString}:${secondsString}.${millisecondsString}`;
  } else {
    return `${minutesString}:${secondsString}`;
  }
}
