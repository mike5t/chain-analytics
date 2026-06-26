"use client";

import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import { Search, RefreshCw, AlertTriangle, ArrowDownRight, ArrowUpLeft, Layers, Shield } from "lucide-react";
import { CHAINS } from "@/lib/config";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

interface FlowRecord {
  tx_hash: string;
  chain: string;
  from_address: string;
  to_address: string;
  token: string;
  token_address: string;
  amount: number;
  block_number: number;
  block_time: string;
}

export default function AddressInvestigator() {
  const [wallet, setWallet] = useState("");
  const [singleChainMode, setSingleChainMode] = useState(false);
  const [selectedChain, setSelectedChain] = useState("ethereum");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    wallet: string;
    flows: FlowRecord[];
    summary: {
      total: number;
      inflows: number;
      outflows: number;
      chainsActive: number;
    };
  } | null>(null);

  const [activeTab, setActiveTab] = useState("overview");
  const [txFilter, setTxFilter] = useState("All"); // "All", "IN", "OUT"
  
  // Risk score states
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [riskData, setRiskData] = useState<any | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const investigate = async () => {
    if (!wallet.trim()) return;
    setLoading(true);
    setResults(null);
    setRiskData(null);
    try {
      let url = `/api/investigate?wallet=${wallet.trim()}`;
      if (singleChainMode) {
        url += `&chain=${selectedChain}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to run investigation");
      const data = await res.json();

      let flows: FlowRecord[] = [];
      let total = 0;
      let inflows = 0;
      let outflows = 0;
      const chains = new Set<string>();

      if (singleChainMode) {
        // Single chain response structure: { wallet, chain, inflows, outflows, total, all_flows }
        // Wait, investigate api route returns a fetch payload
        const detailRes = await fetch(`/api/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sql: `SELECT * FROM address_flows WHERE (from_address = ? OR to_address = ?) AND chain = ? ORDER BY block_time DESC`,
            params: [wallet.trim().toLowerCase(), wallet.trim().toLowerCase(), selectedChain],
          }),
        });
        flows = await detailRes.json();
      } else {
        // All chains response
        const detailRes = await fetch(`/api/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sql: `SELECT * FROM address_flows WHERE (from_address = ? OR to_address = ?) ORDER BY block_time DESC`,
            params: [wallet.trim().toLowerCase(), wallet.trim().toLowerCase()],
          }),
        });
        flows = await detailRes.json();
      }

      flows.forEach((f) => {
        chains.add(f.chain);
        if (f.to_address.toLowerCase() === wallet.trim().toLowerCase()) {
          inflows++;
        } else {
          outflows++;
        }
      });

      setResults({
        wallet: wallet.trim(),
        flows,
        summary: {
          total: flows.length,
          inflows,
          outflows,
          chainsActive: chains.size,
        },
      });

      // Load risk score automatically
      fetchRisk(wallet.trim(), singleChainMode ? selectedChain : "ethereum");
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchRisk = async (targetWallet: string, targetChain: string) => {
    setLoadingRisk(true);
    try {
      const res = await fetch(`/api/risk?wallet=${targetWallet}&chain=${targetChain}`);
      if (res.ok) {
        const data = await res.json();
        setRiskData(data);
      }
    } catch (e) {
      console.error("Risk score query error:", e);
    } finally {
      setLoadingRisk(false);
    }
  };

  // Group timeline by week
  const getTimelineData = () => {
    if (!results) return [];
    const groups: Record<string, number> = {};
    results.flows.forEach((f) => {
      if (!f.block_time) return;
      const d = new Date(f.block_time);
      // Group by week start date (Sunday)
      const day = d.getDay();
      const diff = d.getDate() - day;
      const Sunday = new Date(d.setDate(diff));
      const key = Sunday.toISOString().split("T")[0];
      groups[key] = (groups[key] || 0) + 1;
    });

    return Object.entries(groups)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  // Top tokens volume
  const getTokenVolumeData = () => {
    if (!results) return [];
    const tokens: Record<string, number> = {};
    results.flows.forEach((f) => {
      if (f.token) {
        tokens[f.token] = (tokens[f.token] || 0) + f.amount;
      }
    });
    return Object.entries(tokens)
      .map(([token, amount]) => ({ token, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  };

  // Top Senders / Recipients
  const getCounterparties = (dir: "IN" | "OUT") => {
    if (!results) return [];
    const counts: Record<string, number> = {};
    results.flows.forEach((f) => {
      const isIncoming = f.to_address.toLowerCase() === results.wallet.toLowerCase();
      if (dir === "IN" && isIncoming && f.from_address) {
        counts[f.from_address] = (counts[f.from_address] || 0) + 1;
      } else if (dir === "OUT" && !isIncoming && f.to_address) {
        counts[f.to_address] = (counts[f.to_address] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .map(([address, txs]) => ({
        address: address.substring(0, 10) + "...",
        full_address: address,
        txs,
      }))
      .sort((a, b) => b.txs - a.txs)
      .slice(0, 8);
  };

  // Chain distribution
  const getChainDistribution = () => {
    if (!results) return [];
    const chains: Record<string, number> = {};
    results.flows.forEach((f) => {
      chains[f.chain] = (chains[f.chain] || 0) + 1;
    });
    return Object.entries(chains).map(([chain, count]) => ({
      name: chain.toUpperCase(),
      value: count,
    }));
  };

  // Filtering transactions
  const filteredFlows = results
    ? results.flows.filter((f) => {
        const isIncoming = f.to_address.toLowerCase() === results.wallet.toLowerCase();
        if (txFilter === "IN") return isIncoming;
        if (txFilter === "OUT") return !isIncoming;
        return true;
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <Search className="text-indigo-400 h-8 w-8" /> Address Investigation
        </h1>
        <p className="text-slate-400 mt-1">
          Perform a deep analysis of inflows, outflows, and burn activities. Logs results in SQLite.
        </p>
      </div>

      {/* Inputs */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 backdrop-blur-md space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5 font-mono">Target Address</label>
          <input
            type="text"
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono"
            placeholder="0x..."
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <span className="text-sm font-medium text-slate-300">Chains:</span>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="radio"
                checked={!singleChainMode}
                onChange={() => setSingleChainMode(false)}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              All Chains
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="radio"
                checked={singleChainMode}
                onChange={() => setSingleChainMode(true)}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              Single Chain
            </label>

            {singleChainMode && (
              <select
                value={selectedChain}
                onChange={(e) => setSelectedChain(e.target.value)}
                className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {Object.keys(CHAINS).map((c) => (
                  <option key={c} value={c}>
                    {c.toUpperCase()}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            onClick={investigate}
            disabled={loading || !wallet}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="animate-spin h-5 w-5" /> : "Investigate"}
          </button>
        </div>
      </div>

      {results && (
        <div className="space-y-6">
          <hr className="border-slate-800" />
          
          {/* Summary Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Transactions</span>
              <span className="text-2xl font-bold text-white mt-1 block font-mono">{results.summary.total.toLocaleString()}</span>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block flex items-center gap-1">
                <ArrowDownRight className="text-emerald-400 h-4 w-4" /> Inflows
              </span>
              <span className="text-2xl font-bold text-white mt-1 block font-mono">{results.summary.inflows.toLocaleString()}</span>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block flex items-center gap-1">
                <ArrowUpLeft className="text-rose-400 h-4 w-4" /> Outflows
              </span>
              <span className="text-2xl font-bold text-white mt-1 block font-mono">{results.summary.outflows.toLocaleString()}</span>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block flex items-center gap-1">
                <Layers className="text-indigo-400 h-4 w-4" /> Active Chains
              </span>
              <span className="text-2xl font-bold text-white mt-1 block font-mono">{results.summary.chainsActive}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-slate-800 flex gap-4">
            {["overview", "transactions", "risk", "chains"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors uppercase tracking-wider ${
                  activeTab === tab ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Timeline */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4">Transaction Timeline</h3>
                  <div className="h-64">
                    {mounted && (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={getTimelineData()}>
                          <defs>
                            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <Tooltip
                            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px" }}
                            itemStyle={{ color: "#f8fafc" }}
                          />
                          <Area type="monotone" dataKey="count" stroke="#818cf8" fillOpacity={1} fill="url(#colorCount)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Donut In/Out */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4">Inflow vs Outflow</h3>
                  <div className="h-56 flex items-center justify-center">
                    {mounted && (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Inflows", value: results.summary.inflows },
                              { name: "Outflows", value: results.summary.outflows },
                            ]}
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            <Cell fill="#10b981" />
                            <Cell fill="#f43f5e" />
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <div className="flex justify-center gap-6 text-sm">
                    <span className="flex items-center gap-2"><span className="h-3 w-3 bg-emerald-500 rounded-full"></span> Inflows</span>
                    <span className="flex items-center gap-2"><span className="h-3 w-3 bg-rose-500 rounded-full"></span> Outflows</span>
                  </div>
                </div>
              </div>

              {/* Tokens bar chart */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Tokens by Volume</h3>
                {getTokenVolumeData().length === 0 ? (
                  <p className="text-slate-400 text-center py-10 text-sm">No token volume information.</p>
                ) : (
                  <div className="h-64">
                    {mounted && (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={getTokenVolumeData()}>
                          <XAxis dataKey="token" stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <Tooltip
                            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px" }}
                            itemStyle={{ color: "#f8fafc" }}
                          />
                          <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                )}
              </div>

              {/* Senders / Recipients */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">Top Senders (Counterparties IN)</h3>
                  <div className="space-y-2">
                    {getCounterparties("IN").length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">No sender data</p>
                    ) : (
                      getCounterparties("IN").map((item) => (
                        <div key={item.full_address} className="flex justify-between items-center bg-slate-950/20 px-3 py-2 rounded-lg border border-slate-850">
                          <span className="font-mono text-xs text-indigo-400">{item.full_address}</span>
                          <span className="text-xs font-semibold bg-slate-850 px-2 py-0.5 rounded text-white">{item.txs} txs</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">Top Recipients (Counterparties OUT)</h3>
                  <div className="space-y-2">
                    {getCounterparties("OUT").length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">No recipient data</p>
                    ) : (
                      getCounterparties("OUT").map((item) => (
                        <div key={item.full_address} className="flex justify-between items-center bg-slate-950/20 px-3 py-2 rounded-lg border border-slate-850">
                          <span className="font-mono text-xs text-rose-400">{item.full_address}</span>
                          <span className="text-xs font-semibold bg-slate-850 px-2 py-0.5 rounded text-white">{item.txs} txs</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "transactions" && (
            <div className="space-y-4">
              <div className="flex gap-4 items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-300">All Transactions</h3>
                <div className="flex gap-2 bg-slate-950/40 p-0.5 rounded-lg border border-slate-850">
                  {["All", "IN", "OUT"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setTxFilter(f)}
                      className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
                        txFilter === f ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/60 sticky top-0 font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 z-10">
                      <tr>
                        <th className="px-6 py-3">Block Time</th>
                        <th className="px-6 py-3">Chain</th>
                        <th className="px-6 py-3">Dir</th>
                        <th className="px-6 py-3">Token</th>
                        <th className="px-6 py-3 text-right">Amount</th>
                        <th className="px-6 py-3">From</th>
                        <th className="px-6 py-3">To</th>
                        <th className="px-6 py-3">Tx Hash</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredFlows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-10 text-slate-500">
                            No matching transactions.
                          </td>
                        </tr>
                      ) : (
                        filteredFlows.map((f, i) => {
                          const isIncoming = f.to_address.toLowerCase() === results.wallet.toLowerCase();
                          return (
                            <tr key={f.tx_hash + i} className="hover:bg-slate-900/20">
                              <td className="px-6 py-3 whitespace-nowrap text-slate-400">
                                {f.block_time ? new Date(f.block_time).toLocaleString() : "—"}
                              </td>
                              <td className="px-6 py-3 uppercase font-semibold text-slate-400">{f.chain}</td>
                              <td className="px-6 py-3">
                                <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                  isIncoming ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                                }`}>
                                  {isIncoming ? "IN" : "OUT"}
                                </span>
                              </td>
                              <td className="px-6 py-3 font-semibold text-white">{f.token}</td>
                              <td className="px-6 py-3 text-right font-mono font-semibold text-slate-100">
                                {f.amount.toLocaleString()}
                              </td>
                              <td className="px-6 py-3 font-mono text-slate-400">{f.from_address}</td>
                              <td className="px-6 py-3 font-mono text-slate-400">{f.to_address}</td>
                              <td className="px-6 py-3 font-mono text-xs text-indigo-400 select-all">{f.tx_hash}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "risk" && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 backdrop-blur-md space-y-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Shield className="text-indigo-400" /> Wallet Risk Analysis
              </h3>

              {loadingRisk ? (
                <div className="flex justify-center py-10">
                  <RefreshCw className="animate-spin text-indigo-400 h-8 w-8" />
                </div>
              ) : riskData ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Score circle */}
                  <div className="flex flex-col items-center justify-center p-6 bg-slate-950/20 border border-slate-850 rounded-xl">
                    <div className="relative flex items-center justify-center h-32 w-32 rounded-full border-4 border-slate-800">
                      <span className={`text-4xl font-extrabold font-mono ${
                        riskData.score >= 60 ? "text-rose-500" : riskData.score >= 30 ? "text-amber-500" : "text-emerald-500"
                      }`}>
                        {riskData.score}
                      </span>
                      <span className="text-[10px] text-slate-500 absolute bottom-3 uppercase font-bold">Risk Score</span>
                    </div>

                    <div className={`mt-4 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      riskData.score >= 60 ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                      riskData.score >= 30 ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                      "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    }`}>
                      {riskData.rating}
                    </div>
                  </div>

                  {/* Flag list */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-slate-300">Risk Flags Detected</h4>
                    <div className="space-y-2">
                      {riskData.flags && riskData.flags.length > 0 ? (
                        riskData.flags.map((flag: string, idx: number) => {
                          const isRed = flag.startsWith("🚨") || flag.startsWith("🔴");
                          return (
                            <div key={idx} className={`p-3 rounded-lg border text-sm flex gap-2 items-start ${
                              isRed ? "bg-rose-500/5 border-rose-500/20 text-rose-300" : "bg-amber-500/5 border-amber-500/20 text-amber-300"
                            }`}>
                              <AlertTriangle className="h-5 w-5 shrink-0" />
                              <span>{flag}</span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg">
                          No risk flags detected. Clean profile.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-slate-400 text-sm text-center">Score could not be calculated.</p>
              )}
            </div>
          )}

          {activeTab === "chains" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Activity by Chain</h3>
                <div className="h-64 flex items-center justify-center">
                  {mounted && (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={getChainDistribution()}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          dataKey="value"
                          label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                        >
                          {getChainDistribution().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/20">
                  <h3 className="text-sm font-semibold text-slate-300">Volume distribution by chain</h3>
                </div>
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950/40 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Chain</th>
                      <th className="px-6 py-3 text-right">Transactions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {getChainDistribution().map((c) => (
                      <tr key={c.name} className="hover:bg-slate-900/20">
                        <td className="px-6 py-3 font-semibold text-white">{c.name}</td>
                        <td className="px-6 py-3 text-right font-mono">{c.value.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
