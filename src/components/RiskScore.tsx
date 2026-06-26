"use client";

import { useState } from "react";
import { Shield, RefreshCw, AlertCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { CHAINS } from "@/lib/config";

interface RiskResult {
  wallet: string;
  chain: string;
  score: number;
  rating: string;
  flags: string[];
  labels_found: any[];
}

export default function RiskScore() {
  const [wallet, setWallet] = useState("");
  const [chain, setChain] = useState("ethereum");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [risk, setRisk] = useState<RiskResult | null>(null);

  const calculateRisk = async () => {
    if (!wallet.trim()) return;
    setLoading(true);
    setRisk(null);
    setError(null);
    try {
      const res = await fetch(`/api/risk?wallet=${wallet.trim()}&chain=${chain}`);
      if (!res.ok) throw new Error("Failed to calculate risk score");
      const data = await res.json();
      setRisk(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const getGaugeColor = (score: number) => {
    if (score >= 60) return "text-rose-500 stroke-rose-500";
    if (score >= 30) return "text-amber-500 stroke-amber-500";
    return "text-emerald-500 stroke-emerald-500";
  };

  const getGaugeBg = (score: number) => {
    if (score >= 60) return "bg-rose-500/10 border-rose-500/20";
    if (score >= 30) return "bg-amber-500/10 border-amber-500/20";
    return "bg-emerald-500/10 border-emerald-500/20";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <Shield className="text-indigo-400 h-8 w-8" /> Risk Scorer
        </h1>
        <p className="text-slate-400 mt-1">
          Calculate the forensics risk rating of a wallet (0–100) based on on-chain relations and history.
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
          onClick={calculateRisk}
          disabled={loading || !wallet}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {loading ? <RefreshCw className="animate-spin h-5 w-5" /> : "Calculate Risk Score"}
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {risk && (
        <div className="space-y-6">
          <hr className="border-slate-800" />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Visual Gauge */}
            <div className={`p-6 border rounded-xl backdrop-blur-md flex flex-col items-center justify-center ${getGaugeBg(risk.score)}`}>
              <div className="relative flex items-center justify-center h-48 w-48">
                {/* SVG Ring Gauge */}
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="96"
                    cy="96"
                    r="80"
                    stroke="#1f2937"
                    strokeWidth="10"
                    fill="transparent"
                  />
                  <circle
                    cx="96"
                    cy="96"
                    r="80"
                    stroke="currentColor"
                    strokeWidth="10"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 80}
                    strokeDashoffset={2 * Math.PI * 80 * (1 - risk.score / 100)}
                    className={`${getGaugeColor(risk.score)} transition-all duration-1000 ease-out`}
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-5xl font-extrabold font-mono text-white">{risk.score}</span>
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Forensics score</span>
                </div>
              </div>

              <div className="mt-6 text-center">
                <span className={`text-lg font-bold tracking-widest uppercase ${
                  risk.score >= 60 ? "text-rose-400" : risk.score >= 30 ? "text-amber-400" : "text-emerald-400"
                }`}>
                  {risk.rating}
                </span>
                <p className="text-slate-400 text-xs mt-1 font-mono">{risk.wallet}</p>
              </div>
            </div>

            {/* Flags & Annotations */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-300 border-b border-slate-800 pb-3 flex items-center gap-1.5">
                {risk.score >= 30 ? <AlertTriangle className="text-amber-400" /> : <ShieldCheck className="text-emerald-400" />}
                Forensics Signal Breakdown
              </h3>
              
              <div className="space-y-2">
                {risk.flags.length === 0 ? (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 rounded-lg p-4 flex gap-3 items-center">
                    <ShieldCheck className="h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">No risk flags found. Clean transaction history.</p>
                  </div>
                ) : (
                  risk.flags.map((flag, idx) => {
                    const isSevere = flag.includes("🚨") || flag.includes("🔴") || flag.includes("SANCTIONED");
                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border text-sm flex gap-2.5 items-start ${
                          isSevere
                            ? "bg-rose-500/5 border-rose-500/20 text-rose-300"
                            : flag.includes("✅")
                            ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300"
                            : "bg-amber-500/5 border-amber-500/20 text-amber-300"
                        }`}
                      >
                        <AlertTriangle className="h-5 w-5 shrink-0" />
                        <span>{flag}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
