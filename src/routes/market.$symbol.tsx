import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getMarketCandles } from "@/lib/market.functions";
import { analyze, ema, formatPct, formatPrice, rsi, sma } from "@/lib/indicators";

const RESOLUTIONS = [
  { value: "15", label: "۱۵ دقیقه" },
  { value: "60", label: "۱ ساعت" },
  { value: "240", label: "۴ ساعت" },
  { value: "720", label: "۱۲ ساعت" },
  { value: "1D", label: "روزانه" },
] as const;

export const Route = createFileRoute("/market/$symbol")({
  head: ({ params }) => {
    const pretty = params.symbol.replace("_", "/");
    return {
      meta: [
        { title: `تحلیل زنده ${pretty} | صرافی تبدیل` },
        {
          name: "description",
          content: `نمودار قیمت، RSI، میانگین متحرک و سیگنال روند برای بازار ${pretty} در صرافی تبدیل.`,
        },
        { property: "og:title", content: `تحلیل زنده ${pretty}` },
        {
          property: "og:description",
          content: `قیمت لحظه‌ای و تحلیل تکنیکال ${pretty} در صرافی تبدیل.`,
        },
      ],
    };
  },
  component: MarketDetail,
  errorComponent: ({ error }) => (
    <div dir="rtl" className="p-10 text-center text-sm text-loss" role="alert">
      {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div dir="rtl" className="p-10 text-center text-sm text-muted-foreground">
      این بازار پیدا نشد.
    </div>
  ),
});

function MarketDetail() {
  const { symbol } = Route.useParams();
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]["value"]>("60");

  const { data, isFetching } = useQuery({
    queryKey: ["candles", symbol, resolution],
    queryFn: () => getMarketCandles({ data: { symbol, resolution, bars: 240 } }),
    refetchInterval: 15_000,
  });

  const candles = data?.candles ?? [];
  const quote = data?.info?.quoteAsset ?? (symbol.endsWith("IRT") ? "IRT" : "USDT");
  const base = data?.info?.baseAsset ?? symbol.split("_")[0]!;
  const result = analyze(candles);

  const closes = candles.map((c) => c.close);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ema9 = ema(closes, 9);
  const rsiSeries = rsi(closes);

  const chartData = candles.map((c, i) => ({
    time: new Date(c.time * 1000).toLocaleString("fa-IR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    close: c.close,
    ma20: ma20[i],
    ma50: ma50[i],
    ema9: ema9[i],
    rsi: rsiSeries[i],
    volume: c.volume,
  }));

  const signalTone =
    result?.signal.includes("خرید") ? "text-gain" : result?.signal.includes("فروش") ? "text-loss" : "";

  return (
    <div dir="rtl" className="mx-auto w-full max-w-[1400px] px-4 py-8 lg:px-8">
      <Link
        to="/"
        className="mb-5 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
      >
        <ArrowRight className="size-4" />
        بازگشت به فهرست بازار
      </Link>

      <header className="panel mb-6 flex flex-wrap items-end justify-between gap-6 p-6">
        <div>
          <h1 className="text-2xl font-black">
            {base}
            <span className="text-muted-foreground">/{quote}</span>
          </h1>
          <p className="mt-2 text-3xl font-black num">
            {formatPrice(result?.price ?? null, quote)}
          </p>
          <p
            className={`mt-1 text-sm font-bold num ${
              (result?.trendPct ?? 0) >= 0 ? "text-gain" : "text-loss"
            }`}
          >
            {formatPct(result?.trendPct ?? null)} در بازه انتخابی
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-secondary/40 p-1">
          {RESOLUTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setResolution(r.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                resolution === r.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">نمودار قیمت و میانگین متحرک</h2>
            <span className="text-xs text-muted-foreground">
              {isFetching ? "به‌روزرسانی…" : `${candles.length} کندل`}
            </span>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="price" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis
                  orientation="right"
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  width={90}
                  tickFormatter={(v: number) => formatPrice(v, quote)}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v) => formatPrice(Number(v), quote)}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="var(--color-primary)"
                  fill="url(#price)"
                  strokeWidth={2}
                  dot={false}
                  name="قیمت"
                />
                <Area
                  type="monotone"
                  dataKey="ma20"
                  stroke="var(--color-warn)"
                  fill="transparent"
                  strokeWidth={1.4}
                  dot={false}
                  name="MA20"
                />
                <Area
                  type="monotone"
                  dataKey="ma50"
                  stroke="var(--color-accent)"
                  fill="transparent"
                  strokeWidth={1.4}
                  dot={false}
                  name="MA50"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <h3 className="mt-6 mb-2 text-sm font-bold">شاخص قدرت نسبی (RSI ۱۴)</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis
                  orientation="right"
                  domain={[0, 100]}
                  ticks={[30, 50, 70]}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v) => Number(v).toFixed(1)}
                />
                <Line
                  type="monotone"
                  dataKey="rsi"
                  stroke="var(--color-accent)"
                  strokeWidth={1.8}
                  dot={false}
                  name="RSI"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="panel p-5">
            <p className="text-xs text-muted-foreground">سیگنال تحلیل ترکیبی</p>
            <p className={`mt-2 text-2xl font-black ${signalTone}`}>{result?.signal ?? "—"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground num">
              امتیاز روند: {result?.score ?? "—"}
            </p>
            <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
              {(result?.notes ?? []).map((n) => (
                <li key={n} className="flex gap-2">
                  <span className="text-primary">•</span>
                  {n}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel grid grid-cols-2 gap-4 p-5 text-sm">
            <Metric label="RSI" value={result?.rsi != null ? result.rsi.toFixed(1) : "—"} />
            <Metric label="میانگین ۲۰" value={formatPrice(result?.ma20 ?? null, quote)} />
            <Metric label="میانگین ۵۰" value={formatPrice(result?.ma50 ?? null, quote)} />
            <Metric
              label="EMA ۹"
              value={formatPrice((ema9.at(-1) as number | null) ?? null, quote)}
            />
            <Metric
              label="بالاترین بازه"
              value={formatPrice(candles.length ? Math.max(...candles.map((c) => c.high)) : null, quote)}
            />
            <Metric
              label="پایین‌ترین بازه"
              value={formatPrice(candles.length ? Math.min(...candles.map((c) => c.low)) : null, quote)}
            />
          </div>

          <div className="panel p-5">
            <h3 className="mb-3 text-sm font-bold">حجم معاملات</h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <XAxis dataKey="time" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    stroke="var(--color-info)"
                    fill="var(--color-info)"
                    fillOpacity={0.18}
                    strokeWidth={1.4}
                    name="حجم"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-bold num">{value}</p>
    </div>
  );
}
