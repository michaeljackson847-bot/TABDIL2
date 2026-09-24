import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getMarketMeta = createServerFn({ method: "GET" }).handler(async () => {
  const { getChunkCount } = await import("./tabdeal.server");
  return getChunkCount();
});

export const getMarketChunk = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ part: z.number().int().min(0) }).parse(data))
  .handler(async ({ data }) => {
    const { getMarketChunk: fetchChunk } = await import("./tabdeal.server");
    return fetchChunk(data.part);
  });

export const getMarketCandles = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        symbol: z.string().min(2),
        resolution: z.enum(["5", "15", "30", "60", "240", "720", "1D"]),
        bars: z.number().int().min(50).max(600).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { getHistory, getMarkets } = await import("./tabdeal.server");
    const markets = await getMarkets();
    const info = markets.find((m) => m.tabdealSymbol === data.symbol);
    const bars = data.bars ?? 300;
    const minutes = data.resolution === "1D" ? 1440 : Number(data.resolution);
    const now = Math.floor(Date.now() / 1000);
    const from = now - bars * minutes * 60;
    const candles = await getHistory(data.symbol, data.resolution, from, now);
    return { info: info ?? null, candles, updatedAt: Date.now() };
  });
