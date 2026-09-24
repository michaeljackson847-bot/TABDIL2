/**
 * Tabdeal exchange public market data access (server-only).
 */

// Current public REST host, with the legacy host retained as a fallback.
const BASES = [
  "https://api1.tabdeal.org",
  "https://api.tabdeal.ir",
] as const;
const UA = "Mozilla/5.0 (compatible; TabdealMarketDashboard/1.0)";

export type MarketInfo = {
  symbol: string;
  tabdealSymbol: string;
  baseAsset: string;
  quoteAsset: string;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketStat = MarketInfo & {
  price: number | null;
  changePct: number | null;
  high24: number | null;
  low24: number | null;
  volume24: number | null;
  quoteVolume24: number | null;
  spark: number[];
};

async function apiJson<T>(path: string): Promise<T> {
  let lastError: unknown;

  for (const base of BASES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) {
        lastError = new Error(`Tabdeal ${base}${path} → ${res.status}`);
        continue;
      }
      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Unable to reach Tabdeal API: ${path}`);
}

let marketsCache: { at: number; data: MarketInfo[] } | null = null;

type RawMarket = {
  symbol: string;
  tabdealSymbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
};

export async function getMarkets(): Promise<MarketInfo[]> {
  if (marketsCache && Date.now() - marketsCache.at < 10 * 60_000) {
    return marketsCache.data;
  }

  const raw = await apiJson<RawMarket[] | { data?: RawMarket[]; symbols?: RawMarket[] }>(
    "/r/api/v1/exchangeInfo/",
  );
  const rows = Array.isArray(raw) ? raw : (raw.data ?? raw.symbols ?? []);
  const data = rows
    .filter((m) => !m.status || m.status === "TRADING")
    .map((m) => ({
      symbol: m.symbol,
      tabdealSymbol: m.tabdealSymbol,
      baseAsset: m.baseAsset,
      quoteAsset: m.quoteAsset,
    }))
    .sort((a, b) => a.tabdealSymbol.localeCompare(b.tabdealSymbol));

  marketsCache = { at: Date.now(), data };
  return data;
}

export async function getHistory(
  tabdealSymbol: string,
  resolution: string,
  fromSec: number,
  toSec: number,
): Promise<Candle[]> {
  const qs = `symbol=${encodeURIComponent(tabdealSymbol)}&resolution=${encodeURIComponent(
    resolution,
  )}&from=${Math.floor(fromSec)}&to=${Math.floor(toSec)}`;

  try {
    const json = await apiJson<{ data?: Candle[] | (string | number)[][]; no_data?: boolean }>(
      `/r/plots/history/?${qs}`,
    );
    if (!Array.isArray(json.data)) return [];

    return json.data
      .map((c) => {
        if (Array.isArray(c)) {
          const [time, open, high, low, close, volume] = c;
          return {
            time: Number(time),
            open: Number(open),
            high: Number(high),
            low: Number(low),
            close: Number(close),
            volume: Number(volume),
          };
        }
        return {
          time: Number(c.time),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume),
        };
      })
      .filter(
        (c) =>
          Number.isFinite(c.time) &&
          Number.isFinite(c.open) &&
          Number.isFinite(c.high) &&
          Number.isFinite(c.low) &&
          Number.isFinite(c.close) &&
          Number.isFinite(c.volume),
      )
      .sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return out;
}

// Keep serverless invocations small; the UI can request several chunks.
export const CHUNK_SIZE = 20;

export async function getChunkCount(): Promise<{ parts: number; total: number }> {
  const markets = await getMarkets();
  return { parts: Math.ceil(markets.length / CHUNK_SIZE), total: markets.length };
}

function statsFromCandles(info: MarketInfo, candles: Candle[]): MarketStat {
  if (candles.length === 0) {
    return {
      ...info,
      price: null,
      changePct: null,
      high24: null,
      low24: null,
      volume24: null,
      quoteVolume24: null,
      spark: [],
    };
  }

  const first = candles[0]!;
  const last = candles[candles.length - 1]!;
  const price = last.close;
  const changePct = first.open > 0 ? ((price - first.open) / first.open) * 100 : null;
  const high24 = Math.max(...candles.map((c) => c.high));
  const low24 = Math.min(...candles.map((c) => c.low));
  const volume24 = candles.reduce((sum, c) => sum + (c.volume || 0), 0);

  return {
    ...info,
    price,
    changePct,
    high24,
    low24,
    volume24,
    quoteVolume24: volume24 * price,
    spark: candles.map((c) => c.close),
  };
}

const chunkCache = new Map<number, { at: number; data: MarketStat[] }>();

export async function getMarketChunk(part: number): Promise<{
  part: number;
  parts: number;
  total: number;
  updatedAt: number;
  markets: MarketStat[];
}> {
  const markets = await getMarkets();
  const parts = Math.ceil(markets.length / CHUNK_SIZE);
  const slice = markets.slice(part * CHUNK_SIZE, (part + 1) * CHUNK_SIZE);

  const cached = chunkCache.get(part);
  if (cached && Date.now() - cached.at < 20_000) {
    return {
      part,
      parts,
      total: markets.length,
      updatedAt: cached.at,
      markets: cached.data,
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const from = now - 26 * 3600;
  const stats = await mapLimit(slice, 6, async (info) => {
    const candles = await getHistory(info.tabdealSymbol, "60", from, now);
    return statsFromCandles(info, candles);
  });

  const at = Date.now();
  chunkCache.set(part, { at, data: stats });
  return { part, parts, total: markets.length, updatedAt: at, markets: stats };
}
