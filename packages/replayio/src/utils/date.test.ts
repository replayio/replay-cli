import { formatDuration, formatRelativeDate, formatTimestamp, getRelativeDate } from "./date";

describe("utils/date", () => {
  describe("formatDuration", () => {
    it("should support weeks", () => {
      const MS = 1000 * 60 * 60 * 24 * 7;
      expect(formatDuration(1 * MS)).toBe("1 week");
      expect(formatDuration(2 * MS)).toBe("2 weeks");
    });

    it("should support days", () => {
      const MS = 1000 * 60 * 60 * 24;
      expect(formatDuration(1 * MS)).toBe("1 day");
      expect(formatDuration(2 * MS)).toBe("2 days");
      expect(formatDuration(6 * MS)).toBe("6 days");
    });

    it("should support hours", () => {
      const MS = 1000 * 60 * 60;
      expect(formatDuration(1 * MS)).toBe("1 hour");
      expect(formatDuration(2 * MS)).toBe("2 hours");
      expect(formatDuration(23 * MS)).toBe("23 hours");
    });

    it("should support minutes", () => {
      const MS = 1000 * 60;
      expect(formatDuration(1 * MS)).toBe("1 min");
      expect(formatDuration(2 * MS)).toBe("2 mins");
      expect(formatDuration(59 * MS)).toBe("59 mins");
    });

    it("should support seconds", () => {
      const MS = 1000;
      expect(formatDuration(1 * MS)).toBe("1 sec");
      expect(formatDuration(2 * MS)).toBe("2 secs");
      expect(formatDuration(59 * MS)).toBe("59 secs");
    });

    it("should support 0", () => {
      expect(formatDuration(0)).toBe("0sec");
    });
  });

  describe("getRelativeDate and formatRelativeDate", () => {
    it("should support years", () => {
      expect(formatRelativeDate(getRelativeDate({ yearsAgo: 1 }))).toBe("1 year ago");
      expect(formatRelativeDate(getRelativeDate({ yearsAgo: 2 }))).toBe("2 years ago");
    });

    it("should support months", () => {
      expect(formatRelativeDate(getRelativeDate({ monthsAgo: 1 }))).toBe("1 month ago");
      expect(formatRelativeDate(getRelativeDate({ monthsAgo: 2 }))).toBe("2 months ago");
      expect(formatRelativeDate(getRelativeDate({ monthsAgo: 11 }))).toBe("11 months ago");
    });

    it("should support weeks", () => {
      expect(formatRelativeDate(getRelativeDate({ weeksAgo: 1 }))).toBe("1 week ago");
      expect(formatRelativeDate(getRelativeDate({ weeksAgo: 2 }))).toBe("2 weeks ago");
      expect(formatRelativeDate(getRelativeDate({ weeksAgo: 4 }))).toBe("4 weeks ago");
    });

    it("should support days", () => {
      expect(formatRelativeDate(getRelativeDate({ daysAgo: 1 }))).toBe("1 day ago");
      expect(formatRelativeDate(getRelativeDate({ daysAgo: 2 }))).toBe("2 days ago");
      expect(formatRelativeDate(getRelativeDate({ daysAgo: 6 }))).toBe("6 days ago");
    });

    it("should support hours", () => {
      expect(formatRelativeDate(getRelativeDate({ hoursAgo: 1 }))).toBe("1 hour ago");
      expect(formatRelativeDate(getRelativeDate({ hoursAgo: 2 }))).toBe("2 hours ago");
      expect(formatRelativeDate(getRelativeDate({ hoursAgo: 23 }))).toBe("23 hours ago");
    });

    it("should support minutes", () => {
      expect(formatRelativeDate(getRelativeDate({ minutesAgo: 1 }))).toBe("1 min ago");
      expect(formatRelativeDate(getRelativeDate({ minutesAgo: 2 }))).toBe("2 mins ago");
      expect(formatRelativeDate(getRelativeDate({ minutesAgo: 59 }))).toBe("59 mins ago");
    });

    it("should support seconds", () => {
      expect(formatRelativeDate(getRelativeDate({ secondsAgo: 1 }))).toBe("1 sec ago");
      expect(formatRelativeDate(getRelativeDate({ secondsAgo: 2 }))).toBe("2 secs ago");
      expect(formatRelativeDate(getRelativeDate({ secondsAgo: 59 }))).toBe("59 secs ago");
    });

    it("should support 0", () => {
      expect(formatRelativeDate(new Date())).toBe("now");
    });
  });

  describe("formatTimestamp", () => {
    it("should support seconds", () => {
      expect(formatTimestamp(0, false)).toBe("0:00");
      expect(formatTimestamp(1, false)).toBe("0:00");
      expect(formatTimestamp(1_000, false)).toBe("0:01");
      expect(formatTimestamp(59_000, false)).toBe("0:59");
      expect(formatTimestamp(60_000, false)).toBe("1:00");
      expect(formatTimestamp(61_000, false)).toBe("1:01");
    });

    it("should support milliseconds", () => {
      expect(formatTimestamp(0, true)).toBe("0:00.000");
      expect(formatTimestamp(1, true)).toBe("0:00.001");
      expect(formatTimestamp(1_543, true)).toBe("0:01.543");
      expect(formatTimestamp(59_002, true)).toBe("0:59.002");
      expect(formatTimestamp(60_300, true)).toBe("1:00.300");
      expect(formatTimestamp(61_040, true)).toBe("1:01.040");
    });
  });
});
