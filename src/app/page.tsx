"use client";

import { useState, useEffect } from "react";
import {
  Coins,
  Search,
  Network,
  User,
  Shield,
  AlertOctagon,
  Database,
  ChevronRight,
  Menu,
  X,
  Sun,
  Moon
} from "lucide-react";

import WalletChecker from "@/components/WalletChecker";
import AddressInvestigator from "@/components/AddressInvestigator";
import HopAnalysis from "@/components/HopAnalysis";
import WalletProfile from "@/components/WalletProfile";
import RiskScore from "@/components/RiskScore";
import SanctionsScreen from "@/components/SanctionsScreen";
import SqlQuery from "@/components/SqlQuery";
import { CHAINS } from "@/lib/config";

const MENU_ITEMS = [
  { id: "checker", label: "Wallet Checker", icon: Coins, component: WalletChecker },
  { id: "investigate", label: "Investigate Address", icon: Search, component: AddressInvestigator },
  { id: "hops", label: "Hop Analysis", icon: Network, component: HopAnalysis },
  { id: "profile", label: "Wallet Profile", icon: User, component: WalletProfile },
  { id: "risk", label: "Risk Score", icon: Shield, component: RiskScore },
  { id: "sanctions", label: "Sanctions Screen", icon: AlertOctagon, component: SanctionsScreen },
  { id: "query", label: "SQL Query", icon: Database, component: SqlQuery },
];

export default function Home() {
  const [currentView, setCurrentView] = useState("checker");
  const [sanctionsCount, setSanctionsCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);

  useEffect(() => {
    fetchSanctionsCount();
    const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
    const initialTheme = savedTheme || "dark";
    setTheme(initialTheme);
    if (initialTheme === "light") {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    if (newTheme === "light") {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    }
  };

  const fetchSanctionsCount = async () => {
    try {
      const res = await fetch("/api/sanctions");
      if (res.ok) {
        const data = await res.json();
        setSanctionsCount(data.count || 0);
      }
    } catch (e) {
      console.error("Failed to load OFAC SDN counts", e);
    }
  };

  const SelectedComponent = MENU_ITEMS.find((item) => item.id === currentView)?.component || WalletChecker;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#030712] text-slate-100">
      {/* Mobile Top Navbar */}
      <header className="lg:hidden flex items-center justify-between bg-slate-950/80 border-b border-slate-800/80 p-4 sticky top-0 z-50 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-white text-sm tracking-tighter">
            CA
          </div>
          <span className="font-bold text-white tracking-tight">Chain Analytics</span>
        </div>
        <div className="flex items-center gap-3">
          {theme && (
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors border border-slate-800 flex items-center justify-center cursor-pointer"
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-600" />}
            </button>
          )}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-slate-400 hover:text-white">
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </header>

      {/* Sidebar Navigation */}
      <aside className={`fixed inset-y-0 left-0 transform ${
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      } lg:translate-x-0 transition-transform duration-250 ease-in-out z-40 w-72 bg-slate-950/60 border-r border-slate-900/60 flex flex-col justify-between p-6 backdrop-blur-xl lg:sticky lg:h-screen sticky top-0`}>
        <div className="space-y-6">
          {/* Logo & Theme Switcher */}
          <div className="hidden lg:flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-white text-base tracking-tighter shadow-lg shadow-indigo-600/30">
                CA
              </div>
              <div>
                <h2 className="font-extrabold text-white tracking-tight leading-none text-base">Chain Analytics</h2>
                <span className="text-[10px] text-indigo-400 font-semibold tracking-widest uppercase">Forensics</span>
              </div>
            </div>
            {theme && (
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors border border-slate-800 flex items-center justify-center cursor-pointer shrink-0"
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                {theme === "dark" ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-600" />}
              </button>
            )}
          </div>

          <hr className="border-slate-900 hidden lg:block" />

          {/* Menu Items */}
          <nav className="space-y-1">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    isActive
                      ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/25"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/30 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`h-4.5 w-4.5 ${isActive ? "text-indigo-400" : "text-slate-400"}`} />
                    <span>{item.label}</span>
                  </div>
                  {isActive && <ChevronRight className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer info & Statuses */}
        <div className="mt-8 pt-4 border-t border-slate-900 space-y-4">
          <div className="flex justify-between items-center bg-slate-900/40 p-2.5 rounded-lg border border-slate-850">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">OFAC Addresses</span>
            <span className="text-xs font-bold text-indigo-400 font-mono">{sanctionsCount.toLocaleString()}</span>
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Chain Status</span>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-400 font-medium">
              {Object.keys(CHAINS).map((c) => {
                const isRpcOnly = !CHAINS[c].explorer_supported;
                return (
                  <div key={c} className="flex items-center gap-1.5 capitalize">
                    <span className={`h-1.5 w-1.5 rounded-full ${isRpcOnly ? "bg-sky-500" : "bg-emerald-500 animate-pulse"}`}></span>
                    <span>{c}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-8 lg:p-10 max-w-7xl mx-auto w-full">
        <SelectedComponent />
      </main>

      {/* Mobile background dim overlay */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 lg:hidden"
        ></div>
      )}
    </div>
  );
}
