import { describe, expect, it } from "vitest";
import { getAvailableNowContext } from "@/lib/available-now";

// Bangkok = UTC+7. Slots: 1 08:40-11:00 · 2 12:00-14:20 · 3 14:30-16:50 · 4 17:00-19:20.
const bkk = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const DAY = "2026-09-28";

describe("1. inside each AcademicSlot", () => {
  it.each([
    ["09:00", "SLOT_1", 120],
    ["13:00", "SLOT_2", 80],
    ["14:45", "SLOT_3", 125],
    ["19:00", "SLOT_4", 20],
  ])("%s Bangkok -> %s with %i minutes left", (time, slot, minutesLeft) => {
    expect(getAvailableNowContext(bkk(DAY, time))).toEqual({
      kind: "IN_SLOT",
      today: DAY,
      slot,
      startsAt: expect.any(String),
      endsAt: expect.any(String),
      minutesLeft,
    });
  });

  it("reports the slot's real instants", () => {
    const context = getAvailableNowContext(bkk(DAY, "14:45"));
    expect(context).toMatchObject({
      startsAt: bkk(DAY, "14:30").toISOString(),
      endsAt: bkk(DAY, "16:50").toISOString(),
    });
  });

  it("rounds the last seconds up to 1 minute", () => {
    const context = getAvailableNowContext(new Date(bkk(DAY, "10:59").getTime() + 30_000));
    expect(context).toMatchObject({ kind: "IN_SLOT", slot: "SLOT_1", minutesLeft: 1 });
  });
});

describe("2/3. before SLOT_1 and between slots: next slot, never a current one", () => {
  it.each([
    ["06:00", "SLOT_1", "08:40"],
    ["11:30", "SLOT_2", "12:00"],
    ["14:25", "SLOT_3", "14:30"],
    ["16:55", "SLOT_4", "17:00"],
  ])("%s -> BETWEEN, next %s at %s", (time, nextSlot, start) => {
    expect(getAvailableNowContext(bkk(DAY, time))).toEqual({
      kind: "BETWEEN",
      today: DAY,
      nextSlot,
      nextStartsAt: bkk(DAY, start).toISOString(),
    });
  });
});

describe("4. after SLOT_4", () => {
  it.each(["19:20", "21:00", "23:59"])("%s -> DAY_OVER", (time) => {
    expect(getAvailableNowContext(bkk(DAY, time))).toEqual({ kind: "DAY_OVER", today: DAY });
  });
});

describe("5. Bangkok date, whatever the server timezone", () => {
  it("00:30 Bangkok is already the next day (17:30Z the day before)", () => {
    expect(getAvailableNowContext(new Date("2026-09-28T17:30:00Z"))).toMatchObject({
      kind: "BETWEEN",
      today: "2026-09-29",
      nextSlot: "SLOT_1",
    });
  });

  it("23:30 Bangkok is still today", () => {
    expect(getAvailableNowContext(new Date("2026-09-28T16:30:00Z"))).toEqual({ kind: "DAY_OVER", today: DAY });
  });
});

describe("17. slot transitions", () => {
  it("the exact end instant is no longer the slot; the exact start instant is", () => {
    expect(getAvailableNowContext(bkk(DAY, "16:50"))).toMatchObject({ kind: "BETWEEN", nextSlot: "SLOT_4" });
    expect(getAvailableNowContext(new Date(bkk(DAY, "16:50").getTime() - 1))).toMatchObject({
      kind: "IN_SLOT",
      slot: "SLOT_3",
    });
    expect(getAvailableNowContext(bkk(DAY, "17:00"))).toMatchObject({ kind: "IN_SLOT", slot: "SLOT_4" });
  });

  it("walking the boundaries in order never skips a state", () => {
    const sequence = ["08:39", "08:40", "10:59", "11:00", "12:00", "14:20", "14:30", "16:50", "17:00", "19:20"].map(
      (time) => {
        const context = getAvailableNowContext(bkk(DAY, time));
        return context.kind === "IN_SLOT" ? context.slot : context.kind;
      }
    );
    expect(sequence).toEqual([
      "BETWEEN",
      "SLOT_1",
      "SLOT_1",
      "BETWEEN",
      "SLOT_2",
      "BETWEEN",
      "SLOT_3",
      "BETWEEN",
      "SLOT_4",
      "DAY_OVER",
    ]);
  });
});

describe("display helpers", () => {
  it("formats remaining time in Thai", async () => {
    const { formatMinutesThai } = await import("@/lib/ui-terms");
    expect(formatMinutesThai(35)).toBe("35 นาที");
    expect(formatMinutesThai(120)).toBe("2 ชม.");
    expect(formatMinutesThai(125)).toBe("2 ชม. 5 นาที");
    expect(formatMinutesThai(-3)).toBe("0 นาที");
  });
});
