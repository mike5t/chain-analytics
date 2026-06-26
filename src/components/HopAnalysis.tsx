"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  Network,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  ExternalLink,
  Info,
  Check,
  Copy,
  Layers
} from "lucide-react";
import { CHAINS, KNOWN_ADDRESSES } from "@/lib/config";

interface HopEdge {
  source: string;
  destination: string;
  chain: string;
  hop_number: number;
  token: string;
  amount: number;
  tx_hash: string;
}

interface DestinationInfo {
  total_received: number;
  tx_count: number;
  tokens: string[];
}

const CATEGORY_COLORS = {
  cex: { fill: "#78350f", stroke: "#f59e0b", glow: "glow-gold" }, // amber
  defi: { fill: "#064e3b", stroke: "#10b981", glow: "glow-indigo" }, // emerald
  bridge: { fill: "#0c4a6e", stroke: "#0ea5e9", glow: "glow-indigo" }, // sky
  mixer: { fill: "#4c0519", stroke: "#f43f5e", glow: "glow-gold" }, // rose
  burn: { fill: "#18181b", stroke: "#71717a", glow: "none" }, // zinc
  start: { fill: "#1e1b4b", stroke: "#6366f1", glow: "glow-indigo" }, // indigo
  default: { fill: "#0f172a", stroke: "#475569", glow: "none" } // slate
};

const getBlockExplorerUrl = (addr: string, chainName: string) => {
  switch (chainName.toLowerCase()) {
    case "ethereum":
      return `https://etherscan.io/address/${addr}`;
    case "base":
      return `https://basescan.org/address/${addr}`;
    case "arbitrum":
      return `https://arbiscan.io/address/${addr}`;
    case "polygon":
      return `https://polygonscan.com/address/${addr}`;
    case "optimism":
      return `https://optimistic.etherscan.io/address/${addr}`;
    case "bsc":
      return `https://bscscan.com/address/${addr}`;
    case "scroll":
      return `https://scrollscan.com/address/${addr}`;
    case "avalanche":
      return `https://snowtrace.io/address/${addr}`;
    default:
      return null;
  }
};

export default function HopAnalysis() {
  const [wallet, setWallet] = useState("");
  const [chain, setChain] = useState("ethereum");
  const [hops, setHops] = useState(2);
  const [minAmount, setMinAmount] = useState(0.1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [results, setResults] = useState<{
    start: string;
    chain: string;
    hops: number;
    addresses_found: number;
    edge_count: number;
    top_destinations: Record<string, DestinationInfo>;
    graph: HopEdge[];
  } | null>(null);

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [graphSearchQuery, setGraphSearchQuery] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // DAG layout and visualization preferences
  const [layoutMode, setLayoutMode] = useState<"horizontal" | "vertical">("horizontal");
  const [tokenFilter, setTokenFilter] = useState("ALL");
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [highlightMode, setHighlightMode] = useState<"all" | "incoming" | "outgoing">("all");
  const [copied, setCopied] = useState(false);

  // Funder tracking states
  const [funderData, setFunderData] = useState<Record<string, {
    funder: string;
    amount: number;
    token: string;
    tx_hash: string;
    block_time: string;
  } | null>>({});
  const [funderLoading, setFunderLoading] = useState<Record<string, boolean>>({});
  const [funderError, setFunderError] = useState<Record<string, string | null>>({});

  // High Performance Refs for Pan & Zoom
  const gRef = useRef<SVGGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Direct DOM manipulator for smooth GPU transforms
  const updateTransform = () => {
    if (gRef.current) {
      const { x, y, scale } = transformRef.current;
      gRef.current.setAttribute("transform", `translate(${x}, ${y}) scale(${scale})`);
    }
  };

  // Sync native HTML5 fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Reset viewport zoom/pan whenever new results load
  useEffect(() => {
    transformRef.current = { x: 0, y: 0, scale: 1 };
    updateTransform();
  }, [results]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error("Error enabling fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchFirstFunder = async (address: string) => {
    const addrLower = address.toLowerCase();
    if (funderData[addrLower] !== undefined || funderLoading[addrLower]) return;

    setFunderLoading((prev) => ({ ...prev, [addrLower]: true }));
    setFunderError((prev) => ({ ...prev, [addrLower]: null }));

    try {
      const res = await fetch(`/api/funder?wallet=${address}&chain=${chain}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Funder not found");
      }
      const data = await res.json();
      setFunderData((prev) => ({ ...prev, [addrLower]: data }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load funder";
      setFunderError((prev) => ({ ...prev, [addrLower]: msg }));
      setFunderData((prev) => ({ ...prev, [addrLower]: null }));
    } finally {
      setFunderLoading((prev) => ({ ...prev, [addrLower]: false }));
    }
  };

  const runAnalysis = async () => {
    if (!wallet.trim()) return;
    setLoading(true);
    setResults(null);
    setError(null);
    setSelectedNode(null);
    setHoveredNode(null);
    setTokenFilter("ALL");
    setFunderData({});
    setFunderLoading({});
    setFunderError({});
    try {
      const res = await fetch(
        `/api/hops?wallet=${wallet.trim()}&chain=${chain}&max_hops=${hops}&min_amount=${minAmount}`
      );
      if (!res.ok) throw new Error("Failed to trace hops");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Extract unique tokens for the filter dropdown
  const uniqueTokens = useMemo(() => {
    if (!results) return [];
    const tokens = new Set<string>();
    results.graph.forEach((edge) => tokens.add(edge.token));
    return Array.from(tokens);
  }, [results]);

  // Filter edges based on token selection
  const filteredEdges = useMemo(() => {
    if (!results) return [];
    return results.graph.filter((edge) => {
      if (tokenFilter !== "ALL" && edge.token !== tokenFilter) return false;
      return true;
    });
  }, [results, tokenFilter]);

  // High Performance Adjacency List for Path Tracing
  const { forwardAdjacency, backwardAdjacency } = useMemo(() => {
    const forward: Record<string, { dest: string; edgeIndex: number }[]> = {};
    const backward: Record<string, { src: string; edgeIndex: number }[]> = {};

    filteredEdges.forEach((edge, idx) => {
      const s = edge.source.toLowerCase();
      const d = edge.destination.toLowerCase();
      if (!forward[s]) forward[s] = [];
      forward[s].push({ dest: d, edgeIndex: idx });

      if (!backward[d]) backward[d] = [];
      backward[d].push({ src: s, edgeIndex: idx });
    });

    return { forwardAdjacency: forward, backwardAdjacency: backward };
  }, [filteredEdges]);

  // Calculate highlighted subgraphs based on selection or hover
  const highlightedSubgraphs = useMemo(() => {
    const activeNode = hoveredNode || selectedNode;
    if (!activeNode || !results) {
      return { nodes: new Set<string>(), edges: new Set<number>(), isActive: false };
    }

    const activeLower = activeNode.toLowerCase();
    const highlightedNodes = new Set<string>([activeLower]);
    const highlightedEdges = new Set<number>();

    // Helper to trace forwards (descendants)
    const traceForward = (node: string) => {
      const outgoing = forwardAdjacency[node];
      if (!outgoing) return;
      outgoing.forEach(({ dest, edgeIndex }) => {
        if (!highlightedEdges.has(edgeIndex)) {
          highlightedEdges.add(edgeIndex);
          highlightedNodes.add(dest);
          traceForward(dest);
        }
      });
    };

    // Helper to trace backwards (ancestors)
    const traceBackward = (node: string) => {
      const incoming = backwardAdjacency[node];
      if (!incoming) return;
      incoming.forEach(({ src, edgeIndex }) => {
        if (!highlightedEdges.has(edgeIndex)) {
          highlightedEdges.add(edgeIndex);
          highlightedNodes.add(src);
          traceBackward(src);
        }
      });
    };

    if (highlightMode === "all" || highlightMode === "outgoing") {
      traceForward(activeLower);
    }
    if (highlightMode === "all" || highlightMode === "incoming") {
      traceBackward(activeLower);
    }

    return { nodes: highlightedNodes, edges: highlightedEdges, isActive: true };
  }, [hoveredNode, selectedNode, results, forwardAdjacency, backwardAdjacency, highlightMode]);

  // Memoize graph nodes layout calculations to prevent massive GC memory overhead
  const graphLayout = useMemo(() => {
    if (!results) return null;

    const edges = filteredEdges;
    const nodesSet = new Set<string>();
    nodesSet.add(results.start.toLowerCase());
    edges.forEach((e) => {
      nodesSet.add(e.source.toLowerCase());
      nodesSet.add(e.destination.toLowerCase());
    });

    const nodes = Array.from(nodesSet);

    // Assign layers based on hop distance from start (BFS)
    const depth: Record<string, number> = {};
    depth[results.start.toLowerCase()] = 0;

    const queue = [results.start.toLowerCase()];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currDepth = depth[current];
      edges
        .filter((e) => e.source.toLowerCase() === current)
        .forEach((e) => {
          const dest = e.destination.toLowerCase();
          if (depth[dest] === undefined) {
            depth[dest] = currDepth + 1;
            queue.push(dest);
          }
        });
    }

    // Default layers for disconnected nodes (if any)
    nodes.forEach((n) => {
      if (depth[n] === undefined) depth[n] = 1;
    });

    const layers: Record<number, string[]> = {};
    nodes.forEach((n) => {
      const d = depth[n];
      if (!layers[d]) layers[d] = [];
      layers[d].push(n);
    });

    const maxDepth = Math.max(...Object.keys(layers).map(Number));

    const width = 800;
    const height = 450;

    // Calculate node coordinates based on layoutMode
    const positions: Record<string, { x: number; y: number }> = {};
    Object.entries(layers).forEach(([dStr, nodeList]) => {
      const d = Number(dStr);
      
      if (layoutMode === "horizontal") {
        // Horizontal: Left to Right
        const x = 80 + d * ((width - 160) / Math.max(maxDepth, 1));
        nodeList.forEach((node, idx) => {
          const y = ((idx + 1) * height) / (nodeList.length + 1);
          positions[node] = { x, y };
        });
      } else {
        // Vertical: Top to Bottom
        const y = 60 + d * ((height - 120) / Math.max(maxDepth, 1));
        nodeList.forEach((node, idx) => {
          const x = ((idx + 1) * width) / (nodeList.length + 1);
          positions[node] = { x, y };
        });
      }
    });

    return {
      edges,
      nodes,
      positions,
      width,
      height,
    };
  }, [results, filteredEdges, layoutMode]);

  // Helper for friendly names lookup
  const getFriendlyName = (addr: string) => {
    const match = KNOWN_ADDRESSES[addr.toLowerCase()];
    return match ? match.label : null;
  };

  // Helper to determine node color theme
  const getNodeTheme = (node: string, isStart: boolean) => {
    if (isStart) return CATEGORY_COLORS.start;
    const meta = KNOWN_ADDRESSES[node.toLowerCase()];
    if (meta && CATEGORY_COLORS[meta.category as keyof typeof CATEGORY_COLORS]) {
      return CATEGORY_COLORS[meta.category as keyof typeof CATEGORY_COLORS];
    }
    return CATEGORY_COLORS.default;
  };

  // Bezier curve calculations for curved flow paths
  const getBezierPath = (x1: number, y1: number, x2: number, y2: number) => {
    if (layoutMode === "horizontal") {
      const dx = x2 - x1;
      const cx1 = x1 + dx * 0.45;
      const cy1 = y1;
      const cx2 = x2 - dx * 0.45;
      const cy2 = y2;
      return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    } else {
      const dy = y2 - y1;
      const cx1 = x1;
      const cy1 = y1 + dy * 0.45;
      const cx2 = x2;
      const cy2 = y2 - dy * 0.45;
      return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    }
  };

  // Bezier midpoint calculation for volume tags
  const getBezierMidpoint = (x1: number, y1: number, x2: number, y2: number) => {
    let cx1: number, cy1: number, cx2: number, cy2: number;
    if (layoutMode === "horizontal") {
      const dx = x2 - x1;
      cx1 = x1 + dx * 0.45;
      cy1 = y1;
      cx2 = x2 - dx * 0.45;
      cy2 = y2;
    } else {
      const dy = y2 - y1;
      cx1 = x1;
      cy1 = y1 + dy * 0.45;
      cx2 = x2;
      cy2 = y2 - dy * 0.45;
    }
    // Bezier formula at t=0.5
    const mx = 0.125 * x1 + 0.375 * cx1 + 0.375 * cx2 + 0.125 * x2;
    const my = 0.125 * y1 + 0.375 * cy1 + 0.375 * cy2 + 0.125 * y2;
    return { x: mx, y: my };
  };

  // Stroke width sizing scaling log10 with token normalizer
  const getEdgeWidth = (amount: number, token: string) => {
    let normalized = amount;
    const t = token.toUpperCase();
    if (t.includes("USDC") || t.includes("USDT") || t.includes("DAI") || t.includes("BUSD")) {
      normalized = amount / 1000;
    }
    return Math.max(1.2, Math.min(6.5, Math.log10(normalized + 1) * 1.5 + 1.2));
  };

  // SVG Node Link calculations
  const renderNetworkGraph = () => {
    if (!graphLayout || !results) return null;

    const { edges, nodes, positions, width, height } = graphLayout;
    const nodeRadius = 18;

    // Drag & Pan Events (Uses mutable refs directly to bypass React render cycle lag)
    const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
      const target = e.target as SVGElement;
      if (
        target.tagName === "circle" ||
        target.tagName === "text" ||
        target.closest(".node-group") ||
        target.closest(".edge-interactive")
      ) {
        return;
      }
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX - transformRef.current.x,
        y: e.clientY - transformRef.current.y,
      };
    };

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isPanningRef.current) return;
      transformRef.current.x = e.clientX - panStartRef.current.x;
      transformRef.current.y = e.clientY - panStartRef.current.y;
      updateTransform();
    };

    const handleMouseUp = () => {
      isPanningRef.current = false;
    };

    const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
      const zoomFactor = 1.05;
      let newScale = transformRef.current.scale;
      if (e.deltaY < 0) {
        newScale = Math.min(4, transformRef.current.scale * zoomFactor);
      } else {
        newScale = Math.max(0.2, transformRef.current.scale / zoomFactor);
      }
      transformRef.current.scale = newScale;
      updateTransform();
    };

    return (
      <div
        ref={containerRef}
        className={`bg-slate-950/60 border border-slate-800 rounded-xl p-5 relative flex flex-col transition-all duration-300 ${
          isFullscreen ? "bg-slate-950 p-8 w-screen h-screen flex flex-col justify-between border-none" : "w-full"
        }`}
      >
        {/* Fullscreen Title */}
        {isFullscreen && (
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 shrink-0">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Network className="text-indigo-400 h-5 w-5" /> Hop Analysis Graph — Fullscreen View
            </h4>
            <button
              onClick={toggleFullscreen}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white rounded-lg border border-slate-750 text-xs font-semibold"
            >
              Exit Fullscreen
            </button>
          </div>
        )}

        <div className="flex justify-between items-center mb-3 shrink-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-300">Hierarchical Layered DAG</h4>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/20 capitalize font-mono">
              {layoutMode} View
            </span>
          </div>
          {!isFullscreen && (
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              Tip: Drag grid to Pan, Scroll to Zoom, Hover nodes to Trace
            </span>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-4 mb-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800 shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search bar */}
            <div className="relative flex items-center w-full md:max-w-xs">
              <span className="absolute left-3 text-slate-500">
                <Search className="h-4 w-4" />
              </span>
              <input
                type="text"
                placeholder="Search address in graph..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                value={graphSearchQuery}
                onChange={(e) => setGraphSearchQuery(e.target.value)}
              />
              {graphSearchQuery && (
                <button
                  onClick={() => setGraphSearchQuery("")}
                  className="absolute right-3 text-slate-400 hover:text-white text-xs font-semibold"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Layout, Filter and Visibility Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Layout Mode */}
              <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => setLayoutMode("horizontal")}
                  className={`px-2 py-1 text-xs font-semibold rounded transition-all ${
                    layoutMode === "horizontal"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Horizontal DAG
                </button>
                <button
                  onClick={() => setLayoutMode("vertical")}
                  className={`px-2 py-1 text-xs font-semibold rounded transition-all ${
                    layoutMode === "vertical"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Vertical DAG
                </button>
              </div>

              {/* Token Filter */}
              {uniqueTokens.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Token</span>
                  <select
                    value={tokenFilter}
                    onChange={(e) => setTokenFilter(e.target.value)}
                    className="bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 font-mono font-bold"
                  >
                    <option value="ALL">ALL TOKENS</option>
                    {uniqueTokens.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Highlight Mode */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-500">Trace Mode</span>
                <select
                  value={highlightMode}
                  onChange={(e) => setHighlightMode(e.target.value as "all" | "incoming" | "outgoing")}
                  className="bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 font-bold"
                  title="Path Tracing Mode"
                >
                  <option value="all">Ancestors + Descendants</option>
                  <option value="incoming">Ancestors Only (Source)</option>
                  <option value="outgoing">Descendants Only (Dest)</option>
                </select>
              </div>

              {/* Toggle Edge Labels */}
              <button
                onClick={() => setShowEdgeLabels(!showEdgeLabels)}
                className={`px-2.5 py-1 border rounded-lg text-xs font-semibold transition-colors ${
                  showEdgeLabels
                    ? "bg-slate-800 border-slate-700 text-white"
                    : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                Labels: {showEdgeLabels ? "ON" : "OFF"}
              </button>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
                <button
                  onClick={() => {
                    transformRef.current.scale = Math.min(4, transformRef.current.scale + 0.15);
                    updateTransform();
                  }}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-250 hover:text-white rounded border border-slate-750 transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    transformRef.current.scale = Math.max(0.2, transformRef.current.scale - 0.15);
                    updateTransform();
                  }}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-250 hover:text-white rounded border border-slate-750 transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    transformRef.current = { x: 0, y: 0, scale: 1 };
                    updateTransform();
                  }}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-250 hover:text-white rounded border border-slate-750 transition-colors"
                  title="Reset View"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-250 hover:text-white rounded border border-slate-750 transition-colors"
                  title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SVG Container */}
        <div className="flex-1 w-full overflow-hidden flex items-center justify-center bg-slate-950/40 rounded-xl border border-slate-900 min-h-[450px] relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-full select-none cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <defs>
              {/* Custom Styles */}
              <style>{`
                @keyframes flowDash {
                  to {
                    stroke-dashoffset: -20;
                  }
                }
                .edge-flow-animated {
                  stroke-dasharray: 6, 4;
                  animation: flowDash 0.8s linear infinite;
                }
                .edge-transition {
                  transition: stroke 0.3s, stroke-width 0.3s, opacity 0.3s;
                }
                .node-transition {
                  transition: transform 0.3s, fill 0.3s, stroke 0.3s, opacity 0.3s;
                }
              `}</style>

              {/* Dotted Grid Pattern */}
              <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.2" fill="#475569" opacity="0.3" />
              </pattern>

              {/* Glowing effects */}
              <filter id="glow-indigo" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-gold" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              {/* Arrowheads */}
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="21"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#475569" />
              </marker>
              <marker
                id="arrow-highlighted"
                viewBox="0 0 10 10"
                refX="21"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#818cf8" />
              </marker>
            </defs>

            {/* Inner transformation group */}
            <g ref={gRef}>
              {/* Infinite Grid layer */}
              <rect
                x="-10000"
                y="-10000"
                width="20000"
                height="20000"
                fill="url(#grid)"
                className="pointer-events-none"
              />

              {/* Draw Edges */}
              {edges.map((edge, idx) => {
                const from = positions[edge.source.toLowerCase()];
                const to = positions[edge.destination.toLowerCase()];
                if (!from || !to) return null;

                const isEdgeHighlighted = highlightedSubgraphs.isActive && highlightedSubgraphs.edges.has(idx);
                const hasActiveTracing = highlightedSubgraphs.isActive;

                // Base path curve
                const d = getBezierPath(from.x, from.y, to.x, to.y);
                const strokeWidth = getEdgeWidth(edge.amount, edge.token);
                const mid = getBezierMidpoint(from.x, from.y, to.x, to.y);

                return (
                  <g key={idx} className="edge-interactive">
                    {/* Shadow interactive line helper to make hovering easier */}
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={15}
                      className="cursor-pointer"
                    />

                    {/* Background edge path */}
                    <path
                      d={d}
                      fill="none"
                      stroke={isEdgeHighlighted ? "#818cf8" : hasActiveTracing ? "#1e293b" : "#334155"}
                      strokeWidth={strokeWidth}
                      markerEnd={isEdgeHighlighted ? "url(#arrow-highlighted)" : "url(#arrow)"}
                      opacity={isEdgeHighlighted ? 1 : hasActiveTracing ? 0.08 : 0.75}
                      className="edge-transition"
                    />

                    {/* Animated flow path overlaid */}
                    {isEdgeHighlighted && (
                      <path
                        d={d}
                        fill="none"
                        stroke="#a5b4fc"
                        strokeWidth={strokeWidth * 0.9}
                        className="edge-flow-animated"
                        opacity={0.8}
                      />
                    )}

                    {/* Edge Volume text label */}
                    {showEdgeLabels && (
                      <g
                        transform={`translate(${mid.x}, ${mid.y})`}
                        opacity={isEdgeHighlighted ? 1 : hasActiveTracing ? 0.05 : 0.8}
                        className="edge-transition"
                      >
                        <rect
                          x="-28"
                          y="-7"
                          width="56"
                          height="12"
                          rx="3"
                          fill="#030712"
                          stroke={isEdgeHighlighted ? "#818cf8" : "#1e293b"}
                          strokeWidth="0.5"
                        />
                        <text
                          textAnchor="middle"
                          fill={isEdgeHighlighted ? "#a5b4fc" : "#94a3b8"}
                          fontSize="7.5px"
                          fontWeight="bold"
                          className="pointer-events-none font-mono"
                          y="1.5"
                        >
                          {edge.amount >= 1000
                            ? `${(edge.amount / 1000).toFixed(1)}k`
                            : edge.amount.toFixed(2)}{" "}
                          {edge.token}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Draw Nodes */}
              {nodes.map((node) => {
                const pos = positions[node];
                if (!pos) return null;

                const isStart = node === results.start.toLowerCase();
                const isSelected = selectedNode === node;
                const isHovered = hoveredNode === node;
                const isSearchMatch =
                  graphSearchQuery.trim() !== "" &&
                  node.includes(graphSearchQuery.toLowerCase().trim());

                const isNodeHighlighted =
                  !highlightedSubgraphs.isActive || highlightedSubgraphs.nodes.has(node);

                const theme = getNodeTheme(node, isStart);
                const friendly = getFriendlyName(node);

                return (
                  <g
                    key={node}
                    onClick={() => setSelectedNode(selectedNode === node ? null : node)}
                    onMouseEnter={() => setHoveredNode(node)}
                    onMouseLeave={() => setHoveredNode(null)}
                    className="cursor-pointer group node-group node-transition"
                    opacity={isNodeHighlighted ? 1 : 0.18}
                  >
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={nodeRadius}
                      fill={theme.fill}
                      stroke={
                        isSearchMatch
                          ? "#fbbf24"
                          : isSelected
                          ? "#ffffff"
                          : isHovered
                          ? "#a5b4fc"
                          : theme.stroke
                      }
                      strokeWidth={isSearchMatch ? 4.5 : isSelected || isHovered ? 3.5 : 1.5}
                      filter={
                        isSearchMatch
                          ? "url(#glow-gold)"
                          : theme.glow !== "none"
                          ? `url(#${theme.glow})`
                          : undefined
                      }
                      className="transition-all duration-300"
                    />

                    {/* Node text identifier */}
                    <text
                      x={pos.x}
                      y={pos.y + 3.5}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="9px"
                      fontWeight="black"
                      className="pointer-events-none select-none font-mono"
                    >
                      {isStart
                        ? "START"
                        : friendly
                        ? friendly.substring(0, 4).toUpperCase()
                        : node.substring(2, 6).toUpperCase()}
                    </text>

                    {/* Label (Always visible for known entities/searched nodes, visible on hover for others) */}
                    <g
                      transform={
                        layoutMode === "horizontal"
                          ? `translate(${pos.x}, ${pos.y - 24})`
                          : `translate(${pos.x}, ${pos.y - 24})`
                      }
                      className={`pointer-events-none transition-all duration-200 ${
                        isSearchMatch || isHovered || isSelected || friendly
                          ? "opacity-100 scale-100"
                          : "opacity-45 scale-95"
                      }`}
                    >
                      {friendly && (
                        <rect
                          x="-35"
                          y="-10"
                          width="70"
                          height="10"
                          rx="2"
                          fill="#4f46e5"
                          opacity="0.15"
                        />
                      )}
                      <text
                        textAnchor="middle"
                        fill={
                          isSearchMatch
                            ? "#fbbf24"
                            : friendly
                            ? "#a5b4fc"
                            : isHovered || isSelected
                            ? "#ffffff"
                            : "#64748b"
                        }
                        fontSize="9px"
                        fontWeight={friendly || isHovered || isSelected ? "bold" : "semibold"}
                        className="font-sans"
                      >
                        {friendly ? friendly : `${node.substring(0, 6)}...${node.substring(node.length - 4)}`}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Floating Glassmorphic Inspector Panel (Top-Right) */}
          {selectedNode && (
            <div className="absolute top-4 right-4 w-72 bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-xl p-4 shadow-2xl z-20 transition-all duration-300 animate-in fade-in slide-in-from-top-2 flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                <div className="flex items-center gap-1.5">
                  <Info className="h-4.5 w-4.5 text-indigo-400" />
                  <span className="font-bold text-white tracking-wide text-xs uppercase font-mono">
                    Address Inspector
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-400 hover:text-slate-200 text-xs hover:bg-slate-900 px-2 py-1 rounded"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3.5 text-xs text-slate-300">
                {/* Entity Label */}
                {getFriendlyName(selectedNode) && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-semibold font-mono">Entity</span>
                    <span className="font-bold text-indigo-300 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                      {getFriendlyName(selectedNode)}
                    </span>
                  </div>
                )}

                {/* Category Badge */}
                {KNOWN_ADDRESSES[selectedNode.toLowerCase()] && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-semibold font-mono">Type</span>
                    <span className="font-bold text-white uppercase px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[9px]">
                      {KNOWN_ADDRESSES[selectedNode.toLowerCase()].category}
                    </span>
                  </div>
                )}

                {/* Full Address */}
                <div className="space-y-1">
                  <span className="text-slate-500 font-semibold font-mono block">Address Hash</span>
                  <div className="flex items-center justify-between bg-slate-900/60 p-2 rounded-lg border border-slate-850 font-mono text-[10px]">
                    <span className="break-all text-slate-200 select-all pr-2">{selectedNode}</span>
                    <button
                      onClick={() => copyToClipboard(selectedNode)}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white shrink-0"
                      title="Copy Address"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Received Stats */}
                {results.top_destinations[selectedNode] && (
                  <div className="space-y-2 pt-1 border-t border-slate-900/60">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-mono font-semibold">Total Received</span>
                      <span className="font-bold text-white font-mono">
                        {results.top_destinations[selectedNode].total_received.toLocaleString()}{" "}
                        {results.top_destinations[selectedNode].tokens[0] || ""}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-mono font-semibold">Transactions</span>
                      <span className="font-bold text-white font-mono">
                        {results.top_destinations[selectedNode].tx_count}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-mono font-semibold">Tokens Seen</span>
                      <span className="font-semibold text-white break-words max-w-[160px] text-right">
                        {results.top_destinations[selectedNode].tokens.join(", ")}
                      </span>
                    </div>
                  </div>
                )}

                {/* First Funder Section */}
                {selectedNode && (
                  <div className="pt-3 border-t border-slate-900/60 space-y-2">
                    <span className="text-slate-500 font-mono font-semibold block text-[10px]">First Gas Funder</span>
                    
                    {funderData[selectedNode.toLowerCase()] === undefined && !funderLoading[selectedNode.toLowerCase()] && (
                      <button
                        onClick={() => fetchFirstFunder(selectedNode!)}
                        className="w-full bg-indigo-650/15 hover:bg-indigo-650/25 border border-indigo-500/20 text-indigo-300 font-medium py-1.5 px-3 rounded-lg transition-colors text-center text-[11px]"
                      >
                        Find First Funder
                      </button>
                    )}

                    {funderLoading[selectedNode.toLowerCase()] && (
                      <div className="flex items-center justify-center gap-1.5 py-1 text-slate-400 font-mono text-[10px]">
                        <RefreshCw className="animate-spin h-3 w-3" /> Fetching funding txn...
                      </div>
                    )}

                    {funderError[selectedNode.toLowerCase()] && (
                      <div className="text-rose-400 text-[10px] bg-rose-500/5 border border-rose-500/10 p-1.5 rounded font-mono">
                        {funderError[selectedNode.toLowerCase()]}
                      </div>
                    )}

                    {funderData[selectedNode.toLowerCase()] && (
                      <div className="space-y-2.5 bg-slate-900/40 p-2.5 border border-slate-900 rounded-lg">
                        {/* Funder Address */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono">
                            <span>Sender</span>
                            {getFriendlyName(funderData[selectedNode.toLowerCase()]!.funder) && (
                              <span className="text-indigo-400 font-bold uppercase">
                                {getFriendlyName(funderData[selectedNode.toLowerCase()]!.funder)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between font-mono text-[10px]">
                            <span className="break-all text-indigo-350 truncate max-w-[135px]" title={funderData[selectedNode.toLowerCase()]!.funder}>
                              {funderData[selectedNode.toLowerCase()]!.funder}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => copyToClipboard(funderData[selectedNode!.toLowerCase()]!.funder)}
                                className="p-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white shrink-0"
                                title="Copy Address"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => {
                                  setWallet(funderData[selectedNode!.toLowerCase()]!.funder);
                                  // Trigger new analysis
                                  setTimeout(() => {
                                    const btn = document.querySelector('button.bg-indigo-650');
                                    if (btn) (btn as HTMLButtonElement).click();
                                  }, 100);
                                }}
                                className="px-1.5 py-0.5 bg-indigo-650 hover:bg-indigo-550 text-white font-sans text-[8.5px] font-bold rounded flex items-center gap-0.5"
                                title="Run new Hop trace from this funder"
                              >
                                Trace
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Funding details */}
                        <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-slate-400 pt-1.5 border-t border-slate-950">
                          <div>
                            <span className="text-slate-500 block">Amount</span>
                            <span className="font-bold text-white">
                              {funderData[selectedNode.toLowerCase()]!.amount.toFixed(4)}{" "}
                              {funderData[selectedNode.toLowerCase()]!.token}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Date</span>
                            <span className="text-slate-200">
                              {new Date(funderData[selectedNode.toLowerCase()]!.block_time).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        {/* Explorer tx link */}
                        {getBlockExplorerUrl(selectedNode, chain) && (
                          <a
                            href={`${getBlockExplorerUrl(selectedNode, chain)!.split('/address/')[0]}/tx/${funderData[selectedNode.toLowerCase()]!.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1 text-[9px] text-slate-500 hover:text-indigo-400 pt-1 text-center"
                          >
                            <ExternalLink className="h-2.5 w-2.5" /> View Funding Txn
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* External Links */}
                <div className="pt-2 border-t border-slate-900/60 flex flex-col gap-1.5">
                  {getBlockExplorerUrl(selectedNode, chain) ? (
                    <a
                      href={getBlockExplorerUrl(selectedNode, chain) || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-200 hover:text-white font-medium py-1.5 rounded-lg transition-colors font-semibold text-[11px]"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" /> Block Explorer View
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Selected Node Panel (Fallback bottom panel for non-floating views) */}
        {!selectedNode && (
          <div className="mt-3 text-center p-3 bg-slate-900/20 border border-slate-850 rounded-lg text-xs text-slate-500 shrink-0">
            Click on any address node in the DAG graph above to inspect its metrics and open its block explorer entry.
          </div>
        )}
      </div>
    );
  };

  const getBarChartData = () => {
    if (!results) return [];
    return Object.entries(results.top_destinations)
      .slice(0, 15)
      .map(([addr, info]) => {
        const friendly = getFriendlyName(addr);
        return {
          address: friendly ? friendly : addr.substring(0, 8) + "...",
          volume: info.total_received,
        };
      });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <Network className="text-indigo-400 h-8 w-8 animate-pulse" /> Hop Analysis — Flow Tracker
        </h1>
        <p className="text-slate-400 mt-1">
          Trace transaction flows and money routing paths N hops deep using a hierarchical layout DAG renderer.
        </p>
      </div>

      {/* Control Panel */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 backdrop-blur-md space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-350 mb-1.5 font-mono">Starting Wallet Address</label>
          <input
            type="text"
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono"
            placeholder="0x..."
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-550 mb-1">Chain</label>
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500 font-semibold"
            >
              {Object.keys(CHAINS).map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-555 mb-1">Max Hops: {hops}</label>
            <input
              type="range"
              min="1"
              max="5"
              value={hops}
              onChange={(e) => setHops(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-555 mb-1">Min Transfer Amount</label>
            <input
              type="number"
              step="0.01"
              value={minAmount}
              onChange={(e) => setMinAmount(parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1 text-white focus:outline-none focus:border-indigo-500 font-semibold font-mono"
            />
          </div>
        </div>

        <button
          onClick={runAnalysis}
          disabled={loading || !wallet}
          className="w-full bg-indigo-650 hover:bg-indigo-550 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/15"
        >
          {loading ? <RefreshCw className="animate-spin h-5 w-5" /> : "Trace Hops"}
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {results && (
        <div className="space-y-6">
          <hr className="border-slate-900" />

          {/* Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex justify-between items-center">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Addresses Traced</span>
                <span className="text-2xl font-bold text-white mt-1 block font-mono">{results.addresses_found}</span>
              </div>
              <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
                <Network className="h-5 w-5" />
              </div>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex justify-between items-center">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Flow Connections</span>
                <span className="text-2xl font-bold text-white mt-1 block font-mono">{results.edge_count}</span>
              </div>
              <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
                <Layers className="h-5 w-5" />
              </div>
            </div>
          </div>

          {/* Network Graph */}
          {renderNetworkGraph()}

          {/* Top destinations bar chart */}
          {mounted && getBarChartData().length > 0 && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Destination Addresses by Volume</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getBarChartData()} layout="vertical">
                    <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} />
                    <YAxis dataKey="address" type="category" stroke="#64748b" fontSize={10} tickLine={false} width={80} />
                    <Tooltip
                      contentStyle={{ background: "#030712", border: "1px solid #1e293b", borderRadius: "8px" }}
                      itemStyle={{ color: "#f8fafc" }}
                    />
                    <Bar dataKey="volume" fill="#818cf8" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Destinations Table */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-800 bg-slate-950/20 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300">Destination Addresses Summary</h3>
              <span className="text-[10px] text-slate-500 font-mono">Sorted by Total Volume</span>
            </div>
            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full text-left text-xs text-slate-350">
                <thead className="bg-slate-950/60 sticky top-0 font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 z-10 text-[10px]">
                  <tr>
                    <th className="px-6 py-3">Address</th>
                    <th className="px-6 py-3">Name Tag</th>
                    <th className="px-6 py-3 text-right">Total Volume Received</th>
                    <th className="px-6 py-3 text-right">Tx Count</th>
                    <th className="px-6 py-3">Tokens Traced</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {Object.entries(results.top_destinations).map(([addr, info]) => {
                    const friendly = getFriendlyName(addr);
                    return (
                      <tr key={addr} className="hover:bg-slate-900/20 transition-colors">
                        <td className="px-6 py-3 font-mono text-indigo-400 select-all font-semibold">{addr}</td>
                        <td className="px-6 py-3">
                          {friendly ? (
                            <span className="text-[10.5px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/25">
                              {friendly}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">No tag</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right font-mono text-white font-bold">{info.total_received.toLocaleString()}</td>
                        <td className="px-6 py-3 text-right font-mono text-slate-300">{info.tx_count}</td>
                        <td className="px-6 py-3 text-slate-400 font-mono text-[10px]">{info.tokens.join(", ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Raw Edges */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-800 bg-slate-950/20">
              <h3 className="text-sm font-semibold text-slate-300">Transaction Flow Path Details (Raw Traces)</h3>
            </div>
            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full text-left text-xs text-slate-350">
                <thead className="bg-slate-950/60 sticky top-0 font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 z-10 text-[10px]">
                  <tr>
                    <th className="px-6 py-3">Hop</th>
                    <th className="px-6 py-3">Source Address</th>
                    <th className="px-6 py-3"></th>
                    <th className="px-6 py-3">Destination Address</th>
                    <th className="px-6 py-3 font-mono">Token</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3">Tx Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredEdges.map((edge, idx) => {
                    const srcFriendly = getFriendlyName(edge.source);
                    const destFriendly = getFriendlyName(edge.destination);
                    return (
                      <tr key={idx} className="hover:bg-slate-900/20 transition-colors">
                        <td className="px-6 py-3 font-mono text-slate-500 font-bold">{edge.hop_number}</td>
                        <td className="px-6 py-3 font-mono text-indigo-455">
                          <span className="select-all" title={edge.source}>{edge.source}</span>
                          {srcFriendly && (
                            <span className="ml-1.5 text-[9px] px-1 py-0.2 rounded bg-indigo-500/10 text-indigo-400 font-bold">
                              {srcFriendly}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-3"><ArrowRight className="h-4 w-4 text-slate-650" /></td>
                        <td className="px-6 py-3 font-mono text-rose-455">
                          <span className="select-all" title={edge.destination}>{edge.destination}</span>
                          {destFriendly && (
                            <span className="ml-1.5 text-[9px] px-1 py-0.2 rounded bg-rose-500/10 text-rose-400 font-bold">
                              {destFriendly}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-white font-bold font-mono">{edge.token}</td>
                        <td className="px-6 py-3 text-right font-mono text-white font-bold">{edge.amount.toLocaleString()}</td>
                        <td className="px-6 py-3 font-mono text-slate-500 select-all text-[11px]">{edge.tx_hash}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
