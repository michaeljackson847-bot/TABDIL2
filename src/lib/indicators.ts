export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
      prev = seed;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i]! - values[i - 1]!;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i]! - values[i - 1]!;
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export type Analysis = {
  price: number;
  rsi: number | null;
  ma20: number | null;
  ma50: number | null;
  trendPct: number | null;
  score: number;
  signal: "خرید قوی" | "خرید" | "بی‌طرف" | "فروش" | "فروش قوی";
  notes: string[];
};

export function analyze(candles: Candle[]): Analysis | null {
  if (candles.length < 5) return null;
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1]!;
  const r = rsi(closes).at(-1) ?? null;
  const m20 = sma(closes, 20).at(-1) ?? null;
  const m50 = sma(closes, 50).at(-1) ?? null;
  const first = closes[0]!;
  const trendPct = first > 0 ? ((price - first) / first) * 100 : null;

  let score = 0;
  const notes: string[] = [];

  if (r !== null) {
    if (r < 30) {
      score += 2;
      notes.push(`RSI ${r.toFixed(1)} — اشباع فروش`);
    } else if (r > 70) {
      score -= 2;
      notes.push(`RSI ${r.toFixed(1)} — اشباع خرید`);
    } else {
      score += r > 55 ? 1 : r < 45 ? -1 : 0;
      notes.push(`RSI ${r.toFixed(1)} — محدوده میانی`);
    }
  }
  if (m20 !== null) {
    if (price > m20) {
      score += 1;
      notes.push("قیمت بالای میانگین ۲۰");
    } else {
      score -= 1;
      notes.push("قیمت زیر میانگین ۲۰");
    }
  }
  if (m20 !== null && m50 !== null) {
    if (m20 > m50) {
      score += 1;
      notes.push("میانگین ۲۰ بالای ۵۰ (روند صعودی)");
    } else {
      score -= 1;
      notes.push("میانگین ۲۰ زیر ۵۰ (روند نزولی)");
    }
  }
  if (trendPct !== null) {
    if (trendPct > 2) score += 1;
    else if (trendPct < -2) score -= 1;
  }

  const signal: Analysis["signal"] =
    score >= 3
      ? "خرید قوی"
      : score >= 1
        ? "خرید"
        : score <= -3
          ? "فروش قوی"
          : score <= -1
            ? "فروش"
            : "بی‌طرف";

  return { price, rsi: r, ma20: m20, ma50: m50, trendPct, score, signal, notes };
}

const fa = "fa-IR";

export function formatPrice(value: number | null, quote: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (quote === "IRT") return new Intl.NumberFormat(fa, { maximumFractionDigits: 0 }).format(value);
  const digits = value >= 1000 ? 2 : value >= 1 ? 4 : value >= 0.01 ? 6 : 8;
  return new Intl.NumberFormat(fa, { maximumFractionDigits: digits }).format(value);
}

export function formatCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(fa, { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

export function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
