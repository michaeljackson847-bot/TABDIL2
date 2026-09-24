import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Activity, ArrowUpDown, RefreshCw, Search, TrendingDown, TrendingUp } from "lucide-react";

import { getMarketChunk, getMarketMeta } from "@/lib/market.functions";
import { formatCompact, formatPct, formatPrice } from "@/lib/indicators";
import { Sparkline } from "@/components/Sparkline";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "بازار زنده صرافی تبدیل | تحلیل و نمودار همه ارزها" },
      {
        name: "description",
        content:
          "نمایش زنده تمام بازارهای صرافی تبدیل با قیمت، درصد تغییر، حجم، نمودار پیشرفت و تحلیل اندیکاتوری.",
      },
      { property: "og:title", content: "بازار زنده صرافی تبدیل" },
      {
        property: "og:description",
        content: "قیمت لحظه‌ای، تحلیل روند و نمودار همه جفت‌ارزهای صرافی تبدیل در یک داشبورد.",
      },
    ],
  }),
  component: MarketDashboard,
});

type Stat = Awaited<ReturnType<typeof getMarketChunk>>["markets"][number];
type SortKey = "quoteVolume24" | "changePct" | "price" | "tabdealSymbol";

function MarketDashboard() {
  const metaQuery = useQuery({
    queryKey: ["market-meta"],
    queryFn: () => getMarketMeta(),
    staleTime: 10 * 60_000,
  });

  const parts = metaQuery.data?.parts ?? 0;

  const chunkQueries = useQueries({
    queries: Array.from({ length: parts }, (_, part) => ({
      queryKey: ["market-chunk", part],
      queryFn: () => getMarketChunk({ data: { part } }),
      refetchInterval: 20_000,
      staleTime: 15_000,
    })),
  });

  const markets = useMemo(
    () => chunkQueries.flatMap((q) => q.data?.markets ?? []),
    [chunkQueries],
  );
  const loadedParts = chunkQueries.filter((q) => q.data).length;
  const isRefreshing = chunkQueries.some((q) => q.isFetching);
  const updatedAt = Math.max(0, ...chunkQueries.map((q) => q.data?.updatedAt ?? 0));

  const [query, setQuery] = useState("");
  const [quote, setQuote] = useState<"ALL" | "USDT" | "IRT">("USDT");
  const [sortKey, setSortKey] = useState<SortKey>("quoteVolume24");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const traded = markets.filter((m) => m.price !== null);
  const gainers = traded.filter((m) => (m.changePct ?? 0) > 0).length;
  const losers = traded.filter((m) => (m.changePct ?? 0) < 0).length;
  const avgChange =
    traded.length > 0 ? traded.reduce((s, m) => s + (m.changePct ?? 0), 0) / traded.length : null;
  const totalVolume = traded
    .filter((m) => m.quoteAsset === "USDT")
    .reduce((s, m) => s + (m.quoteVolume24 ?? 0), 0);

  const topGainers = [...traded].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)).slice(0, 5);
  const topLosers = [...traded].sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)).slice(0, 5);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    const rows = markets.filter((m) => {
      if (quote !== "ALL" && m.quoteAsset !== quote) return false;
      if (!q) return true;
      return m.symbol.includes(q) || m.baseAsset.includes(q);
    });
    const dir = asc ? 1 : -1;
    return rows.sort((a, b) => {
      if (sortKey === "tabdealSymbol") return dir * a.symbol.localeCompare(b.symbol);
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return dir * ((av as number) - (bv as number));
    });
  }, [markets, query, quote, sortKey, asc]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * pageSize, current * pageSize + pageSize);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(false);
    }
  }

  return (
    <div dir="rtl" className="mx-auto w-full max-w-[1600px] px-4 py-8 lg:px-8">
      <header className="panel mb-6 flex flex-wrap items-center justify-between gap-5 p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 text-primary">
            <Activity className="size-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">بازار زنده صرافی تبدیل</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {metaQuery.data
                ? `${metaQuery.data.total.toLocaleString("fa-IR")} جفت‌ارز — تحلیل روند، اندیکاتور و نمودار پیشرفت`
                : "در حال دریافت فهرست بازارها…"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span
            className={`flex items-center gap-2 rounded-full border border-border px-3 py-1.5 ${
              isRefreshing ? "text-primary" : "text-gain"
            }`}
          >
            <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "به‌روزرسانی…" : "زنده"}
          </span>
          <span className="num">
            {updatedAt > 0
              ? new Date(updatedAt).toLocaleTimeString("fa-IR")
              : `${loadedParts}/${parts || "?"}`}
          </span>
        </div>
      </header>

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="بازارهای فعال"
          value={traded.length.toLocaleString("fa-IR")}
          hint={`از ${markets.length.toLocaleString("fa-IR")} بازار بارگذاری‌شده`}
        />
        <StatCard
          title="میانگین تغییر ۲۴ ساعت"
          value={formatPct(avgChange)}
          tone={(avgChange ?? 0) >= 0 ? "gain" : "loss"}
          hint="میانگین همه بازارها"
        />
        <StatCard
          title="نسبت صعودی به نزولی"
          value={`${gainers.toLocaleString("fa-IR")} / ${losers.toLocaleString("fa-IR")}`}
          hint="سبز / قرمز"
        />
        <StatCard
          title="حجم ۲۴ ساعت (USDT)"
          value={formatCompact(totalVolume)}
          hint="مجموع بازارهای تتری"
        />
      </section>

      <section className="mb-6 panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">نمودار پیشرفت بازار</h2>
          <span className="text-xs text-muted-foreground">
            سهم بازارهای صعودی از کل معاملات فعال
          </span>
        </div>
        <MarketBreadth gainers={gainers} losers={losers} />
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <MoverList title="بیشترین رشد" icon="up" items={topGainers} />
          <MoverList title="بیشترین افت" icon="down" items={topLosers} />
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative flex-1 min-w-52">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="جست‌وجوی ارز (مثلاً BTC)"
              className="h-10 w-full rounded-xl border border-input bg-secondary/40 pr-10 pl-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex gap-1 rounded-xl border border-border bg-secondary/40 p-1">
            {(["USDT", "IRT", "ALL"] as const).map((q) => (
              <button
                key={q}
                onClick={() => {
                  setQuote(q);
                  setPage(0);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  quote === q
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {q === "ALL" ? "همه" : q === "IRT" ? "تومان" : "تتر"}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground num">
            {filtered.length.toLocaleString("fa-IR")} بازار
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-secondary/30 text-xs text-muted-foreground">
              <tr>
                <Th onClick={() => toggleSort("tabdealSymbol")}>بازار</Th>
                <Th onClick={() => toggleSort("price")}>قیمت</Th>
                <Th onClick={() => toggleSort("changePct")}>تغییر ۲۴ساعت</Th>
                <Th>بالاترین / پایین‌ترین</Th>
                <Th onClick={() => toggleSort("quoteVolume24")}>حجم ۲۴ساعت</Th>
                <Th>روند</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const up = (m.changePct ?? 0) >= 0;
                return (
                  <tr key={m.tabdealSymbol} className="border-t border-border/60 hover:bg-secondary/25">
                    <td className="p-3">
                      <Link
                        to="/market/$symbol"
                        params={{ symbol: m.tabdealSymbol }}
                        className="font-bold hover:text-primary"
                      >
                        {m.baseAsset}
                        <span className="text-muted-foreground">/{m.quoteAsset}</span>
                      </Link>
                    </td>
                    <td className="p-3 num">{formatPrice(m.price, m.quoteAsset)}</td>
                    <td className={`p-3 num font-bold ${up ? "text-gain" : "text-loss"}`}>
                      {formatPct(m.changePct)}
                    </td>
                    <td className="p-3 num text-xs text-muted-foreground">
                      {formatPrice(m.high24, m.quoteAsset)} / {formatPrice(m.low24, m.quoteAsset)}
                    </td>
                    <td className="p-3 num text-muted-foreground">
                      {formatCompact(m.quoteVolume24)}
                    </td>
                    <td className="p-3">
                      <Sparkline values={m.spark} up={up} />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                    {loadedParts < parts || parts === 0
                      ? "در حال دریافت داده‌های بازار…"
                      : "بازاری با این فیلتر پیدا نشد."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border p-4 text-xs">
          <span className="text-muted-foreground num">
            صفحه {(current + 1).toLocaleString("fa-IR")} از {pageCount.toLocaleString("fa-IR")}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, current - 1))}
              disabled={current === 0}
              className="rounded-lg border border-border px-3 py-1.5 font-bold disabled:opacity-40"
            >
              قبلی
            </button>
            <button
              onClick={() => setPage(Math.min(pageCount - 1, current + 1))}
              disabled={current >= pageCount - 1}
              className="rounded-lg border border-border px-3 py-1.5 font-bold disabled:opacity-40"
            >
              بعدی
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Th({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <th className="p-3 text-right font-bold">
      {onClick ? (
        <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground">
          {children}
          <ArrowUpDown className="size-3" />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function StatCard({
  title,
  value,
  hint,
  tone,
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: "gain" | "loss";
}) {
  return (
    <div className="panel p-5">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p
        className={`mt-2 text-2xl font-black num ${
          tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function MarketBreadth({ gainers, losers }: { gainers: number; losers: number }) {
  const total = gainers + losers || 1;
  const upPct = (gainers / total) * 100;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
        <div className="bg-gain" style={{ width: `${upPct}%` }} />
        <div className="bg-loss" style={{ width: `${100 - upPct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs num">
        <span className="text-gain">{upPct.toFixed(1)}% صعودی</span>
        <span className="text-loss">{(100 - upPct).toFixed(1)}% نزولی</span>
      </div>
    </div>
  );
}

function MoverList({
  title,
  items,
  icon,
}: {
  title: string;
  items: Stat[];
  icon: "up" | "down";
}) {
  const Icon = icon === "up" ? TrendingUp : TrendingDown;
  return (
    <div>
      <h3
        className={`mb-3 flex items-center gap-2 text-sm font-bold ${
          icon === "up" ? "text-gain" : "text-loss"
        }`}
      >
        <Icon className="size-4" />
        {title}
      </h3>
      <ul className="space-y-2">
        {items.map((m) => (
          <li key={m.tabdealSymbol}>
            <Link
              to="/market/$symbol"
              params={{ symbol: m.tabdealSymbol }}
              className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/25 px-3 py-2 text-xs hover:border-primary/40"
            >
              <span className="font-bold">
                {m.baseAsset}
                <span className="text-muted-foreground">/{m.quoteAsset}</span>
              </span>
              <span className="num">{formatPrice(m.price, m.quoteAsset)}</span>
              <span className={`num font-bold ${icon === "up" ? "text-gain" : "text-loss"}`}>
                {formatPct(m.changePct)}
              </span>
            </Link>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-muted-foreground">—</li>}
      </ul>
    </div>
  );
}
