"use client";

import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Database, Play, RefreshCw, HelpCircle, AlertCircle } from "lucide-react";

const COLORS = ["#818cf8", "#34d399", "#fb7185", "#f43f5e", "#fbbf24", "#a78bfa", "#22d3ee", "#f472b6"];

const EXAMPLE_QUERIES: Record<string, string> = {
  "Top senders by volume": `SELECT from_address, token, round(SUM(amount), 4) AS total, COUNT(*) AS txs
FROM address_flows
GROUP BY from_address, token
ORDER BY total DESC LIMIT 20`,
  "Recent transactions": `SELECT block_time, chain, token, amount, from_address, to_address
FROM address_flows
ORDER BY block_time DESC LIMIT 50`,
  "Transactions by chain": `SELECT chain, COUNT(*) AS txs, round(SUM(amount), 2) AS volume
FROM address_flows GROUP BY chain ORDER BY txs DESC`,
  "High risk wallets": `SELECT address, score, rating, flags
FROM risk_scores ORDER BY score DESC`,
  "Hourly activity heatmap": `SELECT CAST(strftime('%H', block_time) AS INTEGER) AS hour, COUNT(*) AS txs
FROM address_flows
GROUP BY hour ORDER BY hour`,
};

interface TableInfo {
  Table: string;
  Rows: number;
}

export default function SqlQuery() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedExample, setSelectedExample] = useState("Custom");
  const [sql, setSql] = useState("");
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoChart, setAutoChart] = useState(true);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchTables();
  }, []);

  const fetchTables = async () => {
    setLoadingTables(true);
    try {
      const res = await fetch("/api/query");
      if (res.ok) {
        const data = await res.json();
        setTables(data);
      }
    } catch (e) {
      console.error("Failed to load tables list", e);
    } finally {
      setLoadingTables(false);
    }
  };

  const handleRunQuery = async () => {
    if (!sql.trim()) return;
    setLoadingQuery(true);
    setResults(null);
    setError(null);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sql.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Query execution failed");
      }
      setResults(data);
      
      // Refresh tables count
      fetchTables();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingQuery(false);
    }
  };

  const handleSelectExample = (name: string) => {
    setSelectedExample(name);
    if (name === "Custom") {
      setSql("");
    } else {
      setSql(EXAMPLE_QUERIES[name] || "");
    }
  };

  // Auto chart configuration logic
  const renderAutoChart = () => {
    if (!autoChart || !results || results.length === 0) return null;

    // Detect first numeric key and first string/non-numeric key
    const firstRow = results[0];
    const keys = Object.keys(firstRow);
    
    let numKey: string | null = null;
    let catKey: string | null = null;

    for (const key of keys) {
      const val = firstRow[key];
      if (typeof val === "number" && !numKey) {
        numKey = key;
      } else if (typeof val === "string" && !catKey) {
        catKey = key;
      }
    }

    if (!numKey || !catKey) return null;

    const chartData = results.slice(0, 30).map((row) => ({
      name: String(row[catKey!]).substring(0, 16) + (String(row[catKey!]).length > 16 ? "..." : ""),
      value: Number(row[numKey!]),
    }));

    return (
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
        <h3 className="text-xs font-semibold text-slate-400 mb-4 uppercase tracking-wider">
          Auto Chart: {numKey} by {catKey} (Top 30 Rows)
        </h3>
        <div className="h-64">
          {mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px" }}
                  itemStyle={{ color: "#f8fafc" }}
                />
                <Bar dataKey="value" fill="#818cf8" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <Database className="text-indigo-400 h-8 w-8" /> SQL Query Playground
        </h1>
        <p className="text-slate-400 mt-1">
          Execute direct SQL queries against the local SQLite database at `data/chain_analytics.db`.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Table Schema Side list */}
        <div className="lg:col-span-1 bg-slate-900/40 border border-slate-800 rounded-xl p-4 backdrop-blur-md space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Database className="h-4 w-4" /> Database Tables
            </h3>
            <button onClick={fetchTables} disabled={loadingTables}>
              <RefreshCw className={`h-4 w-4 text-slate-400 hover:text-slate-200 ${loadingTables ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[350px]">
            {tables.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No tables found</p>
            ) : (
              tables.map((t) => (
                <div key={t.Table} className="flex justify-between items-center bg-slate-950/20 px-3 py-2 rounded-lg border border-slate-850">
                  <span className="text-xs font-semibold text-white font-mono">{t.Table}</span>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded font-mono">
                    {t.Rows} rows
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* SQL Input Area */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 backdrop-blur-md space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-slate-300">Preset Queries</label>
                <select
                  value={selectedExample}
                  onChange={(e) => handleSelectExample(e.target.value)}
                  className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 mt-1"
                >
                  <option value="Custom">Custom SQL Query</option>
                  {Object.keys(EXAMPLE_QUERIES).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoChart}
                  onChange={(e) => setAutoChart(e.target.checked)}
                  className="text-indigo-600 focus:ring-indigo-500 rounded bg-slate-950 border-slate-800"
                />
                Auto-generate Charts
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">SQL Editor</label>
              <textarea
                rows={6}
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono text-sm leading-relaxed"
                placeholder="SELECT * FROM address_flows LIMIT 10;"
              />
            </div>

            <button
              onClick={handleRunQuery}
              disabled={loadingQuery || !sql}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loadingQuery ? (
                <RefreshCw className="animate-spin h-5 w-5" />
              ) : (
                <>
                  <Play className="h-4 w-4" /> Run Query
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm font-mono">{error}</p>
            </div>
          )}

          {results && (
            <div className="space-y-6">
              {/* Auto Chart */}
              {renderAutoChart()}

              {/* Data Table */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/20 flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-slate-300">Query Output</h3>
                  <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 font-bold px-2 py-0.5 rounded font-mono">
                    {results.length} rows returned
                  </span>
                </div>

                {results.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">Query executed successfully, but returned no rows.</div>
                ) : (
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950/60 sticky top-0 font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 z-10">
                        <tr>
                          {Object.keys(results[0]).map((col) => (
                            <th key={col} className="px-6 py-3">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 font-mono">
                        {results.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/20">
                            {Object.values(row).map((val: any, colIdx) => (
                              <td key={colIdx} className="px-6 py-2.5 whitespace-nowrap">
                                {val === null ? (
                                  <span className="text-slate-600">null</span>
                                ) : typeof val === "boolean" ? (
                                  val ? (
                                    "true"
                                  ) : (
                                    "false"
                                  )
                                ) : (
                                  String(val)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
