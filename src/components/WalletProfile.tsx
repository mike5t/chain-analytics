"use client";

import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { User, RefreshCw, AlertCircle, Clock, Award, Shield } from "lucide-react";
import { CHAINS } from "@/lib/config";

interface TokenInfo {
  token: string;
  volume: number;
  txs: number;
}

interface HourlyInfo {
  hour: number;
  txs: number;
}

interface CounterpartyInfo {
  address: string;
  raw_address: string;
  total: number;
  txs: number;
}

interface ProfileResult {
  wallet: string;
  chain: string;
  total_txs: number;
  first_seen: string | null;
  last_seen: string | null;
  wallet_age_days: number | null;
  unique_recipients: number;
  unique_senders: number;
  total_received: number;
  total_sent: number;
  top_tokens: TokenInfo[];
  hourly_activity: HourlyInfo[];
  top_sent_to: CounterpartyInfo[];
  top_received_from: CounterpartyInfo[];
}

export default function WalletProfile() {
  const [wallet, setWallet] = useState("");
  const [chain, setChain] = useState("ethereum");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [activeTab, setActiveTab] = useState("hourly");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const generateProfile = async () => {
    if (!wallet.trim()) return;
    setLoading(true);
    setProfile(null);
    setError(null);
    try {
      const res = await fetch(`/api/profile?wallet=${wallet.trim()}&chain=${chain}`);
      if (!res.ok) throw new Error("Failed to load profile. Make sure to Investigate first!");
      const data = await res.json();
      if (data.total_txs === 0) {
        throw new Error("No transactions found for this wallet. Run 'Investigate Address' first!");
      }
      setProfile(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const getHourlyChartData = () => {
    if (!profile) return [];
    // Ensure all 24 hours are represented, even if count is 0
    const fullHours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, "0")}:00`,
      txs: 0,
    }));

    profile.hourly_activity.forEach((h) => {
      if (h.hour >= 0 && h.hour < 24) {
        fullHours[h.hour].txs = h.txs;
      }
    });
    return fullHours;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <User className="text-indigo-400 h-8 w-8" /> Wallet Profiler
        </h1>
        <p className="text-slate-400 mt-1">
          Build a behavioural profile of an address. (Data pulled from local SQLite; run **Investigate** first to populate it).
        </p>
      </div>

      {/* Inputs */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 backdrop-blur-md space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5 font-mono">Wallet Address</label>
            <input
              type="text"
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono"
              placeholder="0x..."
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5 font-mono">Chain</label>
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
            >
              {Object.keys(CHAINS).map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={generateProfile}
          disabled={loading || !wallet}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {loading ? <RefreshCw className="animate-spin h-5 w-5" /> : "Generate Profile"}
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {profile && (
        <div className="space-y-6">
          <hr className="border-slate-800" />

          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Wallet Age</span>
              <span className="text-2xl font-bold text-white mt-1 block font-mono">
                {profile.wallet_age_days !== null ? `${profile.wallet_age_days} days` : "—"}
              </span>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Transactions</span>
              <span className="text-2xl font-bold text-white mt-1 block font-mono">{profile.total_txs.toLocaleString()}</span>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Unique Recipients</span>
              <span className="text-2xl font-bold text-white mt-1 block font-mono">{profile.unique_recipients}</span>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Unique Senders</span>
              <span className="text-2xl font-bold text-white mt-1 block font-mono">{profile.unique_senders}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Received</span>
              <span className="text-xl font-bold text-emerald-400 mt-1 block font-mono">
                {profile.total_received.toLocaleString()} units
              </span>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Sent</span>
              <span className="text-xl font-bold text-rose-400 mt-1 block font-mono">
                {profile.total_sent.toLocaleString()} units
              </span>
            </div>
          </div>

          {/* Profile Tabs */}
          <div className="border-b border-slate-800 flex gap-4">
            {[
              { id: "hourly", label: "⏰ Hourly Activity" },
              { id: "tokens", label: "🪙 Top Tokens" },
              { id: "counterparties", label: "🤝 Counterparties" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "hourly" && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-1">
                <Clock className="h-4 w-4" /> Hourly Activity Distribution (UTC)
              </h3>
              <div className="h-72">
                {mounted && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getHourlyChartData()}>
                      <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px" }}
                        itemStyle={{ color: "#f8fafc" }}
                      />
                      <Bar dataKey="txs" fill="#c084fc" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {activeTab === "tokens" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Token Bar Chart */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Volume by Token</h3>
                <div className="h-64">
                  {mounted && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={profile.top_tokens}>
                        <XAxis dataKey="token" stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px" }}
                          itemStyle={{ color: "#f8fafc" }}
                        />
                        <Bar dataKey="volume" fill="#fb7185" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Tokens Table */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950/40 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Token</th>
                      <th className="px-6 py-3 text-right">Volume</th>
                      <th className="px-6 py-3 text-right">Txs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {profile.top_tokens.map((t) => (
                      <tr key={t.token} className="hover:bg-slate-900/20">
                        <td className="px-6 py-3 font-semibold text-white">{t.token}</td>
                        <td className="px-6 py-3 text-right font-mono">{t.volume.toLocaleString()}</td>
                        <td className="px-6 py-3 text-right font-mono text-slate-400">{t.txs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "counterparties" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Sent to */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-rose-400">Top Counterparties (Sent To)</h3>
                <div className="space-y-2">
                  {profile.top_sent_to.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">No outflow data</p>
                  ) : (
                    profile.top_sent_to.map((item) => (
                      <div key={item.raw_address} className="flex justify-between items-center bg-slate-950/20 px-3 py-2 rounded-lg border border-slate-850">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white">{item.address}</span>
                          <span className="font-mono text-[10px] text-slate-500">{item.raw_address}</span>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <span className="text-xs font-semibold text-white font-mono">{item.total.toLocaleString()}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{item.txs} txs</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Received from */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-emerald-400">Top Counterparties (Received From)</h3>
                <div className="space-y-2">
                  {profile.top_received_from.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">No inflow data</p>
                  ) : (
                    profile.top_received_from.map((item) => (
                      <div key={item.raw_address} className="flex justify-between items-center bg-slate-950/20 px-3 py-2 rounded-lg border border-slate-850">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white">{item.address}</span>
                          <span className="font-mono text-[10px] text-slate-500">{item.raw_address}</span>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <span className="text-xs font-semibold text-white font-mono">{item.total.toLocaleString()}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{item.txs} txs</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
