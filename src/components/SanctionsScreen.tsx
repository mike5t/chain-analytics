"use client";

import { useState, useEffect } from "react";
import { AlertOctagon, RefreshCw, ShieldAlert, CheckCircle, Search } from "lucide-react";

interface HitRecord {
  address: string;
  name: string;
  program: string;
}

export default function SanctionsScreen() {
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [dbSize, setDbSize] = useState(0);
  
  const [results, setResults] = useState<{
    total: number;
    hits: HitRecord[];
    clean: string[];
  } | null>(null);

  useEffect(() => {
    fetchDbSize();
  }, []);

  const fetchDbSize = async () => {
    try {
      const res = await fetch("/api/sanctions");
      if (res.ok) {
        const data = await res.json();
        setDbSize(data.count || 0);
      }
    } catch (e) {
      console.error("Failed to fetch sanctions count", e);
    }
  };

  const screenAddresses = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setResults(null);
    try {
      const addresses = inputText
        .split("\n")
        .map((a) => a.trim())
        .filter((a) => a.length > 0);

      const res = await fetch("/api/sanctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
      });

      if (!res.ok) throw new Error("Failed to screen addresses");
      const data = await res.json(); // { total, hits, sanctioned: [{address, name, program}] }

      const hitAddresses = new Set(data.sanctioned.map((h: HitRecord) => h.address.toLowerCase()));
      const clean = addresses.filter((a) => !hitAddresses.has(a.toLowerCase()));

      setResults({
        total: data.total,
        hits: data.sanctioned,
        clean,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <AlertOctagon className="text-indigo-400 h-8 w-8" /> Sanctions Screening
        </h1>
        <p className="text-slate-400 mt-1">
          Screen addresses against the local OFAC SDN list database.
        </p>
      </div>

      {/* Control Panel */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 backdrop-blur-md space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5 font-mono">
            Paste addresses (one per line)
          </label>
          <textarea
            rows={6}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono text-sm"
            placeholder="0xabc...&#10;0xdef..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
        </div>

        <button
          onClick={screenAddresses}
          disabled={loading || !inputText}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {loading ? <RefreshCw className="animate-spin h-5 w-5" /> : "Screen Addresses"}
        </button>
      </div>

      {results && (
        <div className="space-y-6">
          <hr className="border-slate-800" />

          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Addresses Screened</span>
              <span className="text-2xl font-bold text-white mt-1 block font-mono">{results.total}</span>
            </div>
            <div className={`border rounded-xl p-4 ${results.hits.length > 0 ? "bg-rose-500/5 border-rose-500/20 text-rose-400" : "bg-slate-900/40 border-slate-800 text-slate-400"}`}>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Sanctioned Hits</span>
              <span className="text-2xl font-bold mt-1 block font-mono">
                {results.hits.length > 0 ? `⚠️ ${results.hits.length}` : "0"}
              </span>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">OFAC DB Size</span>
              <span className="text-2xl font-bold text-white mt-1 block font-mono">{dbSize.toLocaleString()}</span>
            </div>
          </div>

          {/* Results Details */}
          {results.hits.length > 0 ? (
            <div className="space-y-4">
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg p-4 flex gap-3 items-center">
                <ShieldAlert className="h-6 w-6 shrink-0 text-rose-500" />
                <div>
                  <h3 className="font-semibold text-white">Security Alert!</h3>
                  <p className="text-sm text-rose-300">Detected {results.hits.length} sanctioned address(es) on the OFAC SDN list.</p>
                </div>
              </div>

              {/* Hits Table */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/40 font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Sanctioned Address</th>
                      <th className="px-6 py-3">List Name</th>
                      <th className="px-6 py-3">Program</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {results.hits.map((hit, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/20 bg-rose-500/[0.02]">
                        <td className="px-6 py-3 font-mono text-rose-400 select-all font-semibold">{hit.address}</td>
                        <td className="px-6 py-3 text-slate-200">{hit.name}</td>
                        <td className="px-6 py-3 text-slate-400">{hit.program}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg p-4 flex gap-3 items-center">
              <CheckCircle className="h-6 w-6 shrink-0 text-emerald-500" />
              <div>
                <h3 className="font-semibold text-white">All Clear</h3>
                <p className="text-sm text-emerald-300">No sanctioned addresses were detected in this screening session.</p>
              </div>
            </div>
          )}

          {/* Clean addresses list */}
          {results.clean.length > 0 && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Clean Addresses ({results.clean.length})</h3>
              <div className="space-y-1 max-h-48 overflow-y-auto bg-slate-950/40 p-3 rounded-lg border border-slate-850">
                {results.clean.map((addr) => (
                  <code key={addr} className="block text-xs font-mono text-emerald-400 select-all py-0.5">{addr}</code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
