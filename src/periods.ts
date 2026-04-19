const MONTH_INDEX: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  sept: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function padMonth(month: number): string {
  return String(month).padStart(2, "0");
}

export function formatPeriodKey(periodKey: string): string {
  const match = periodKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return periodKey;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return periodKey;
  }
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function parsePeriodKey(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const isoMonth = raw.match(/^(\d{4})[-/](\d{1,2})$/);
  if (isoMonth) {
    const month = Number(isoMonth[2]);
    if (month >= 1 && month <= 12) {
      return `${isoMonth[1]}-${padMonth(month)}`;
    }
  }

  const isoDate = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoDate) {
    const month = Number(isoDate[2]);
    if (month >= 1 && month <= 12) {
      return `${isoDate[1]}-${padMonth(month)}`;
    }
  }

  const monthYear = raw.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b[^\d]{0,8}\b(20\d{2}|\d{2})\b/i,
  );
  if (monthYear) {
    const mm = MONTH_INDEX[monthYear[1].slice(0, 4).toLowerCase()] ?? MONTH_INDEX[monthYear[1].slice(0, 3).toLowerCase()];
    const year = monthYear[2].length === 2 ? `20${monthYear[2]}` : monthYear[2];
    if (mm) {
      return `${year}-${mm}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${padMonth(parsed.getUTCMonth() + 1)}`;
  }

  return null;
}

export function detectPeriodKeyFromFileName(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  const named = lower.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s._-]*(20\d{2}|\d{2})/i);
  if (named) {
    const mm = MONTH_INDEX[named[1].toLowerCase()];
    const year = named[2].length === 2 ? `20${named[2]}` : named[2];
    if (mm) return `${year}-${mm}`;
  }

  const leadingYear = lower.match(/(?:^|[^0-9])(20\d{2}|\d{2})[\s._-]?(0[1-9]|1[0-2])(?=$|[^0-9])/);
  if (leadingYear) {
    const year = leadingYear[1].length === 2 ? `20${leadingYear[1]}` : leadingYear[1];
    return `${year}-${leadingYear[2]}`;
  }

  const trailingYear = lower.match(/(?:^|[^0-9])(0[1-9]|1[0-2])[\s._-]?(20\d{2}|\d{2})(?=$|[^0-9])/);
  if (trailingYear) {
    const year = trailingYear[2].length === 2 ? `20${trailingYear[2]}` : trailingYear[2];
    return `${year}-${trailingYear[1]}`;
  }

  return null;
}

export function inferPeriodKeyFromText(text: string): string | null {
  const dateRange = text.match(/\b(\d{1,2})\/(\d{1,2})\s*\/?(\d{2,4})\s*-\s*(\d{1,2})\/(\d{1,2})\s*\/?(\d{2,4})\b/);
  if (dateRange) {
    const year = dateRange[6].length === 2 ? `20${dateRange[6]}` : dateRange[6];
    const month = Number(dateRange[4]);
    if (month >= 1 && month <= 12) {
      return `${year}-${padMonth(month)}`;
    }
  }

  return parsePeriodKey(text);
}

export function toPeriodLabel(input: string | null | undefined): string | null {
  const key = parsePeriodKey(input ?? "");
  return key ? formatPeriodKey(key) : null;
}
