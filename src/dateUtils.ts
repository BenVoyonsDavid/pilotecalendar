import type { Language } from "./types";

export const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const startOfWeek = (input: Date): Date => {
  const date = new Date(input);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(12, 0, 0, 0);
  return date;
};

export const addDays = (input: Date, amount: number): Date => {
  const date = new Date(input);
  date.setDate(date.getDate() + amount);
  return date;
};

export const addWeeks = (input: Date, amount: number): Date => addDays(input, amount * 7);

const localeOf = (language: Language) => language === "fr" ? "fr-CA" : "en-CA";

export const formatDayHeader = (date: Date, language: Language): string =>
  new Intl.DateTimeFormat(localeOf(language), { weekday: "short", day: "numeric", month: "short" })
    .format(date)
    .replace(".", "");

export const formatLongDate = (date: Date, language: Language): string =>
  new Intl.DateTimeFormat(localeOf(language), { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);

export const formatWeekRange = (weekStart: Date, language: Language): string => {
  const weekEnd = addDays(weekStart, 4);
  const start = new Intl.DateTimeFormat(localeOf(language), { day: "numeric", month: "long" }).format(weekStart);
  const end = new Intl.DateTimeFormat(localeOf(language), { day: "numeric", month: "long", year: "numeric" }).format(weekEnd);
  return language === "fr" ? `${start} au ${end}` : `${start} to ${end}`;
};

export const isToday = (date: Date): boolean => toDateKey(date) === toDateKey(new Date());

export const dateInRange = (date: Date, startDate: string, endDate: string) => {
  const key = toDateKey(date);
  return key >= startDate && key <= endDate;
};

const ANCHOR_B = new Date(2026, 8, 7, 12, 0, 0);
export const cycleForWeek = (weekStart: Date): "A" | "B" => {
  const current = startOfWeek(weekStart);
  const diffDays = Math.round((current.getTime() - ANCHOR_B.getTime()) / 86400000);
  const weekOffset = Math.round(diffDays / 7);
  return Math.abs(weekOffset) % 2 === 0 ? "B" : "A";
};
