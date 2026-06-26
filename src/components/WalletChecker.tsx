"use client";

import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Coins, RefreshCw, AlertCircle } from "lucide-react";
import { CHAINS } from "@/lib/config";

const COLORS = ["#818cf8", "#34d399", "#fb7185", "#f43f5e", "#fbbf24", "#a78bfa", "#22d3ee", "#f472b6"];

function formatBalance(bal: number): string {
  if (bal === 0) return "0";
  
  if (bal < 0.0001) {
    const fixed = bal.toFixed(8);
    const trimmed = fixed.replace(/\.?0+$/, "");
    if (trimmed !== "0") {
      return trimmed;
    }
    return bal.toExponential(4).replace(/0+e/, "e").replace(/\.e/, "e");
  }
  
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 5,
  }).format(bal);
}

export default function WalletChecker() {
  const [wallet, setWallet] = useState("");
  const [selectedChain, setSelectedChain] = useState("ethereum");
  const [loadingNative, setLoadingNative] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [nativeBalances, setNativeBalances] = useState<Record<string, any> | null>(null);
  const [tokenBalances, setTokenBalances] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchNative = async () => {
    if (!wallet.trim()) return;
    setLoadingNative(true);
    setNativeBalances(null);
    setTokenBalances(null);
    setError(null);
    try {
      const res = await fetch(`/api/balance?wallet=${wallet.trim()}`);
      if (!res.ok) throw new Error("Failed to fetch native balances");
      const data = await res.json();
      setNativeBalances(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingNative(false);
    }
  };

  const fetchTokens = async () => {
    if (!wallet.trim()) return;
    setLoadingTokens(true);
    setNativeBalances(null);
    setTokenBalances(null);
    setError(null);
    try {
      const res = await fetch(`/api/balance?wallet=${wallet.trim()}&chain=${selectedChain}&tokens=true`);
      if (!res.ok) throw new Error("Failed to fetch token balances");
      const data = await res.json();
      setTokenBalances(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingTokens(false);
    }
  };

  // Format data for charts
  const nativeChartData = nativeBalances
    ? Object.entries(nativeBalances)
        .filter(([_, bal]) => typeof bal === "number" && bal > 0)
        .map(([chain, bal]) => ({
          chain: chain.toUpperCase(),
          balance: bal,
        }))
    : [];

  const tokenChartData = tokenBalances
    ? Object.entries(tokenBalances)
        .filter(([_, bal]) => bal > 0)
        .map(([token, bal]) => ({
          token,
          balance: bal,
        }))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <Coins className="text-indigo-400 h-8 w-8" /> Wallet Balance Checker
        </h1>
        <p className="text-slate-400 mt-1">
          Query live native + ERC-20 balances directly via RPC nodes. No API keys required.
        </p>
      </div>

      {/* Control Panel */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 backdrop-blur-md space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Wallet Address</label>
          <input
            type="text"
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono"
            placeholder="0x..."
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={fetchNative}
            disabled={loadingNative || !wallet}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loadingNative ? <RefreshCw className="animate-spin h-5 w-5" /> : "Check Native Balances"}
          </button>
          
          <div className="flex-1 flex gap-2">
            <select
              value={selectedChain}
              onChange={(e) => setSelectedChain(e.target.value)}
              className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
            >
              {Object.keys(CHAINS).map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
            <button
              onClick={fetchTokens}
              disabled={loadingTokens || !wallet}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loadingTokens ? <RefreshCw className="animate-spin h-5 w-5" /> : "Check ERC-20 Tokens"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Native Balances Results */}
      {nativeBalances && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-white">Native Balances Results</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(nativeBalances).map(([chain, bal]) => {
              const hasError = typeof bal === "string";
              return (
                <div key={chain} className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{chain}</span>
                  <span className={`text-xl font-bold mt-2 font-mono ${hasError ? "text-rose-400 text-sm" : "text-white"}`}>
                    {hasError ? bal : `${formatBalance(bal)} ${CHAINS[chain]?.native}`}
                  </span>
                </div>
              );
            })}
          </div>

          {mounted && nativeChartData.length > 0 && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Balance Distribution</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={nativeChartData}>
                    <XAxis dataKey="chain" stroke="#94a3b8" fontSize={12} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
                    <Tooltip
                      formatter={(value: any) => [typeof value === 'number' ? formatBalance(value) : value, "Balance"]}
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px" }}
                      labelStyle={{ color: "#94a3b8", fontWeight: "bold" }}
                      itemStyle={{ color: "#f8fafc" }}
                    />
                    <Bar dataKey="balance" fill="#818cf8" radius={[4, 4, 0, 0]}>
                      {nativeChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ERC-20 Token Balances Results */}
      {tokenBalances && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-white">Token Balances on {selectedChain.toUpperCase()}</h2>
          
          {tokenChartData.length === 0 ? (
            <div className="text-center py-10 bg-slate-900/20 border border-dashed border-slate-800 rounded-xl text-slate-400">
              No active token balances found for this wallet.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Table */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/20">
                  <h3 className="text-sm font-semibold text-slate-300">Balance Breakdown</h3>
                </div>
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950/40 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Token</th>
                      <th className="px-6 py-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {tokenChartData.map((item, index) => (
                      <tr key={item.token} className="hover:bg-slate-900/30">
                        <td className="px-6 py-3 font-semibold text-white">{item.token}</td>
                        <td className="px-6 py-3 text-right font-mono">{formatBalance(item.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Chart */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Balance Graph</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tokenChartData}>
                      <XAxis dataKey="token" stroke="#94a3b8" fontSize={12} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
                      <Tooltip
                        formatter={(value: any) => [typeof value === 'number' ? formatBalance(value) : value, "Balance"]}
                        contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px" }}
                        labelStyle={{ color: "#94a3b8", fontWeight: "bold" }}
                        itemStyle={{ color: "#f8fafc" }}
                      />
                      <Bar dataKey="balance" fill="#10b981" radius={[4, 4, 0, 0]}>
                        {tokenChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
