"use client";

import { useState, useMemo, useEffect } from "react";

type MemoryResult = {
  id: string;
  content: string;
  score: number;
  metadata: {
    source_app?: string;
    timestamp?: string;
    tags?: string;
    url?: string;
    conversation_id?: string;
    message_type?: string;
  };
};

// Seeded random function for consistent server/client rendering
const seededRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemoryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [embeddingMode, setEmbeddingMode] = useState<string>("loading...");
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [configLoading, setConfigLoading] = useState(false);
  const [configMessage, setConfigMessage] = useState<{type: "success" | "error", text: string} | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchConfig = () => {
    fetch("http://127.0.0.1:2789/config")
      .then(res => res.json())
      .then(data => setEmbeddingMode(data.embedding_mode))
      .catch(() => setEmbeddingMode("unknown"));
  };

  useEffect(() => {
    setMounted(true);
    fetchConfig();
  }, []);

  const handleModeSwitch = async (mode: string) => {
    if (mode === "openai" && !apiKey) {
      setConfigMessage({type: "error", text: "Please enter your OpenAI API key first"});
      return;
    }

    setConfigLoading(true);
    setConfigMessage(null);

    try {
      const response = await fetch("http://127.0.0.1:2789/config", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          embedding_mode: mode,
          openai_api_key: mode === "openai" ? apiKey : undefined,
          persist: true
        })
      });

      const data = await response.json();

      if (response.ok) {
        setEmbeddingMode(data.embedding_mode);
        setConfigMessage({type: "success", text: data.message});
        setTimeout(() => setShowSettings(false), 2000);
      } else {
        setConfigMessage({type: "error", text: data.detail || "Configuration update failed"});
      }
    } catch (err: any) {
      setConfigMessage({type: "error", text: err.message || "Network error"});
    } finally {
      setConfigLoading(false);
    }
  };

  // Generate stable star positions
  const stars = useMemo(() => {
    const smallStars = Array.from({ length: 100 }, (_, i) => ({
      id: `small-${i}`,
      size: 1 + seededRandom(i * 1000) * 2,
      left: seededRandom(i * 1001) * 100,
      top: seededRandom(i * 1002) * 100,
      opacity: seededRandom(i * 1003) * 0.5 + 0.2,
      duration: 2 + seededRandom(i * 1004) * 3,
      delay: seededRandom(i * 1005) * 3,
    }));

    const mediumStars = Array.from({ length: 30 }, (_, i) => ({
      id: `medium-${i}`,
      size: 3 + seededRandom(i * 2000) * 2,
      left: seededRandom(i * 2001) * 100,
      top: seededRandom(i * 2002) * 100,
      opacity: seededRandom(i * 2003) * 0.4 + 0.3,
      duration: 3 + seededRandom(i * 2004) * 4,
      delay: seededRandom(i * 2005) * 4,
    }));

    const largeStars = Array.from({ length: 15 }, (_, i) => ({
      id: `large-${i}`,
      size: 4 + seededRandom(i * 3000) * 3,
      left: seededRandom(i * 3001) * 100,
      top: seededRandom(i * 3002) * 100,
      opacity: seededRandom(i * 3003) * 0.3 + 0.4,
      color: ['#fff', '#a78bfa', '#60a5fa', '#f0abfc'][Math.floor(seededRandom(i * 3004) * 4)],
      duration: 4 + seededRandom(i * 3005) * 5,
      delay: seededRandom(i * 3006) * 5,
    }));

    return { smallStars, mediumStars, largeStars };
  }, []);

  // Generate stable comet trajectories
  const comets = useMemo(() => 
    Array.from({ length: 5 }, (_, i) => {
      const startX = seededRandom(i * 4000) > 0.5 ? -10 : 110;
      const startY = seededRandom(i * 4001) * 100;
      const endX = startX === -10 ? 110 : -10;
      const endY = seededRandom(i * 4002) * 100;
      return {
        id: `comet-${i}`,
        startX,
        startY,
        deltaX: endX - startX,
        deltaY: endY - startY,
        duration: 3 + seededRandom(i * 4003) * 4,
        delay: seededRandom(i * 4004) * 10,
      };
    }), []
  );

  const handleCopyToClipboard = async (content: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering expand/collapse
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000); // Clear after 2 seconds
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        query: query.trim(),
        n_results: "10",
      });

      const res = await fetch(
        `http://127.0.0.1:2789/recall?${params.toString()}`
      );

      if (!res.ok) {
        throw new Error(`Daemon error: ${res.status}`);
      }

      const data = await res.json();
      
      // Filter results if query is provided (for testing mode)
      let filteredResults = data.results ?? [];
      if (query.trim()) {
        const searchTerms = query.trim().toLowerCase();
        filteredResults = filteredResults.filter((r: MemoryResult) => 
          r.content.toLowerCase().includes(searchTerms)
        );
      }
      
      // Sort results by timestamp (most recent first)
      const sortedResults = filteredResults.sort((a: MemoryResult, b: MemoryResult) => {
        const timeA = a.metadata?.timestamp ? new Date(a.metadata.timestamp).getTime() : 0;
        const timeB = b.metadata?.timestamp ? new Date(b.metadata.timestamp).getTime() : 0;
        return timeB - timeA; // Descending order (newest first)
      });
      
      setResults(sortedResults);
    } catch (err: any) {
      setError(err.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen relative overflow-hidden flex flex-col items-center p-8">
      {/* Animated gradient background - Deep space */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-black via-slate-950 to-black">
        <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>
      </div>

      {/* Galaxy Stars - Multiple layers */}
      {mounted && (
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        {/* Small stars */}
        {stars.smallStars.map((star) => (
          <div
            key={star.id}
            className="absolute bg-white rounded-full"
            style={{
              width: `${star.size}px`,
              height: `${star.size}px`,
              left: `${star.left}%`,
              top: `${star.top}%`,
              opacity: star.opacity,
              animation: `twinkle ${star.duration}s ease-in-out infinite`,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}
        
        {/* Medium stars */}
        {stars.mediumStars.map((star) => (
          <div
            key={star.id}
            className="absolute bg-white rounded-full"
            style={{
              width: `${star.size}px`,
              height: `${star.size}px`,
              left: `${star.left}%`,
              top: `${star.top}%`,
              opacity: star.opacity,
              boxShadow: '0 0 4px rgba(255,255,255,0.5)',
              animation: `twinkle ${star.duration}s ease-in-out infinite`,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}

        {/* Large bright stars */}
        {stars.largeStars.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full"
            style={{
              width: `${star.size}px`,
              height: `${star.size}px`,
              left: `${star.left}%`,
              top: `${star.top}%`,
              background: `radial-gradient(circle, ${star.color} 0%, transparent 70%)`,
              opacity: star.opacity,
              boxShadow: '0 0 8px rgba(255,255,255,0.6)',
              animation: `twinkle ${star.duration}s ease-in-out infinite`,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}

        {/* Flying Comets */}
        {comets.map((comet) => (
          <div
            key={comet.id}
            className="absolute animate-comet"
            style={{
              left: `${comet.startX}%`,
              top: `${comet.startY}%`,
              // @ts-ignore
              '--comet-delta-x': `${comet.deltaX}vw`,
              '--comet-delta-y': `${comet.deltaY}vh`,
              '--comet-duration': `${comet.duration}s`,
              '--comet-delay': `${comet.delay}s`,
            } as React.CSSProperties}
          >
            {/* Comet head */}
            <div className="relative">
              <div className="w-3 h-3 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,1)]" />
              {/* Comet trail */}
              <div 
                className="absolute top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-white via-white/50 to-transparent"
                style={{
                  width: '80px',
                  left: '-80px',
                  opacity: 0.8,
                }}
              />
              <div 
                className="absolute top-1/2 -translate-y-1/2 h-2 bg-gradient-to-r from-purple-300 via-purple-300/30 to-transparent blur-sm"
                style={{
                  width: '60px',
                  left: '-60px',
                  opacity: 0.6,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Header with icon */}
      <div className="text-center mb-12 mt-8 z-10">
        <div className="inline-flex items-center justify-center w-20 h-20 mb-6 rounded-[1.5rem] bg-gradient-to-br from-purple-500 to-cyan-500 shadow-2xl shadow-purple-500/50 animate-float">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-10 h-10 text-white"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <path d="M2 12h20" />
          </svg>
        </div>
        <h1 className="relative text-6xl font-black mb-4">
          <span className="relative inline-block bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent animate-shimmer bg-[length:200%_100%]">
            Context Memory Mesh
          </span>
          {/* Glowing effect */}
          <span className="absolute inset-0 bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent blur-xl opacity-50 animate-glow">
            Context Memory Mesh
          </span>
        </h1>
        <p className="text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
          <span className="inline-flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Explore your local memories with AI-powered semantic search
          </span>
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
          <div className="flex items-center gap-2 px-4 py-2 rounded-[0.75rem] bg-white/5 backdrop-blur-xl border border-white/10">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50"></div>
            <span className="text-gray-300 font-medium">Port 2789</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-[0.75rem] bg-white/5 backdrop-blur-xl border border-white/10">
            {embeddingMode === "testing" ? (
              <>
                <div className="w-2 h-2 bg-blue-400 rounded-full shadow-lg shadow-blue-400/50"></div>
                <span className="text-gray-300 font-medium">Testing Mode</span>
              </>
            ) : embeddingMode === "openai" ? (
              <>
                <div className="w-2 h-2 bg-green-400 rounded-full shadow-lg shadow-green-400/50"></div>
                <span className="text-gray-300 font-medium">OpenAI Mode</span>
              </>
            ) : (
              <span className="text-gray-400 font-medium">{embeddingMode}</span>
            )}
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-[0.75rem] bg-gradient-to-r from-purple-500/20 to-cyan-500/20 hover:from-purple-500/30 hover:to-cyan-500/30 backdrop-blur-xl border border-purple-500/30 hover:border-purple-400/50 transition-all duration-200 shadow-lg hover:shadow-purple-500/25 hover:scale-105"
          >
            <svg className="w-4 h-4 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-gray-200 font-medium">Settings</span>
          </button>
        </div>
      </div>

      {/* Search form with glassmorphism */}
      <form onSubmit={handleSearch} className="w-full max-w-3xl mb-10 z-10">
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-[2rem] blur-xl opacity-30 group-hover:opacity-60 transition duration-500"></div>
          <div className="relative flex gap-3 bg-white/10 backdrop-blur-2xl border border-white/20 rounded-[2rem] p-3 shadow-2xl hover:border-white/30 transition-all duration-300">
            <div className="flex-1 flex items-center gap-3 px-5 py-1">
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                className="flex-1 bg-transparent outline-none text-white placeholder:text-gray-400 text-lg font-light"
                placeholder="Search your memories..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="px-8 py-4 rounded-[1.5rem] bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold shadow-xl shadow-purple-500/30 hover:shadow-purple-500/50 transition-all duration-300 hover:scale-[1.02] disabled:hover:scale-100 disabled:opacity-50 flex items-center gap-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Searching...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Search
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Error message */}
      {error && (
        <div className="w-full max-w-3xl mb-6 z-10 animate-slide-up">
          <div className="bg-red-500/20 backdrop-blur-2xl border border-red-400/40 rounded-[1.5rem] p-5 flex items-center gap-3 shadow-xl shadow-red-500/10">
            <svg className="w-6 h-6 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01" />
            </svg>
            <p className="text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="w-full max-w-3xl space-y-4 z-10 pb-20">
        {results.map((r, index) => (
          <div
            key={r.id}
            className="group animate-slide-up"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-cyan-500 rounded-[1.5rem] blur-lg opacity-0 group-hover:opacity-25 transition duration-500"></div>
              <div 
                className="relative bg-white/10 backdrop-blur-2xl border border-white/20 rounded-[1.5rem] p-6 hover:border-white/30 hover:bg-white/[0.12] transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/10"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-11 h-11 rounded-[0.875rem] bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-3">
                      {/* Source App Badge */}
                      {r.metadata?.source_app && (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 backdrop-blur-xl capitalize">
                          {r.metadata.source_app}
                        </span>
                      )}
                      
                      {/* Timestamp */}
                      {r.metadata?.timestamp && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-500/20 text-gray-300 border border-slate-500/30 backdrop-blur-xl">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {new Date(r.metadata.timestamp).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                      
                      {/* Score */}
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/30 backdrop-blur-xl">
                        <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="text-xs text-yellow-300 font-semibold">
                          {r.score.toFixed(2)}
                        </span>
                      </div>
                      
                      {/* ID (smaller, less prominent) */}
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        {r.id.slice(0, 8)}
                      </span>
                    </div>
                    {/* Content with expand/collapse */}
                    <div 
                      onClick={() => toggleExpand(r.id)}
                      className="cursor-pointer group/content"
                    >
                      <p className={`text-gray-200 leading-relaxed text-[15px] transition-all duration-300 ${
                        expandedIds.has(r.id) ? '' : 'line-clamp-3'
                      }`}>
                        {r.content}
                      </p>
                      {r.content.length > 150 && (
                        <div className="mt-2 flex items-center gap-1 text-purple-400 text-sm font-medium group-hover/content:text-purple-300 transition-colors">
                          {expandedIds.has(r.id) ? (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                              </svg>
                              <span>Show less</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </svg>
                              <span>Read more</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Copy button */}
                    <button
                      onClick={(e) => handleCopyToClipboard(r.content, r.id, e)}
                      className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 hover:border-purple-400/50 text-purple-300 hover:text-purple-200 text-sm font-medium transition-all duration-200 hover:scale-105"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Copy</span>
                    </button>
                    
                    {/* Copy indicator */}
                    {copiedId === r.id && (
                      <div className="mt-3 flex items-center gap-2 text-green-400 text-sm animate-fade-in">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium">Copied to clipboard!</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {!loading && !error && results.length === 0 && (
          <div className="text-center py-20 animate-fade-in">
            <div className="inline-flex items-center justify-center w-24 h-24 mb-6 rounded-[2rem] bg-white/5 backdrop-blur-2xl border border-white/10 shadow-xl">
              <svg
                className="w-12 h-12 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-300 mb-2">
              No memories found
            </h3>
            <p className="text-gray-500 max-w-md mx-auto">
              Start searching to explore your knowledge base. The daemon will return relevant memories based on your query.
            </p>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md bg-white/10 backdrop-blur-2xl border border-white/20 rounded-[2rem] shadow-2xl animate-slide-up">
            {/* Close button */}
            <button
              onClick={() => setShowSettings(false)}
              className="absolute top-4 right-4 p-2 rounded-[0.75rem] hover:bg-white/10 transition-colors"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="p-6 border-b border-white/10">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Embedding Configuration
              </h2>
              <p className="text-gray-400 text-sm mt-1">Choose your embedding mode</p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Current Mode */}
              <div className="p-4 bg-white/5 rounded-[1rem] border border-white/10 backdrop-blur-xl">
                <p className="text-sm text-gray-400 mb-1">Current Mode</p>
                <p className="text-lg font-semibold text-white capitalize">{embeddingMode}</p>
              </div>

              {/* Mode Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-300">Select Mode</label>
                
                {/* Testing Mode */}
                <button
                  onClick={() => handleModeSwitch("testing")}
                  disabled={configLoading || embeddingMode === "testing"}
                  className={`w-full p-4 rounded-[1.25rem] border-2 transition-all text-left backdrop-blur-xl ${
                    embeddingMode === "testing"
                      ? "border-blue-500 bg-blue-500/20"
                      : "border-white/20 hover:border-blue-500/50 bg-white/5"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="font-semibold text-white mb-1">Testing Mode</h3>
                      <p className="text-sm text-gray-400">Hash-based embeddings • Free • No API key required</p>
                    </div>
                    {embeddingMode === "testing" && (
                      <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>

                {/* OpenAI Mode */}
                <div className="space-y-3">
                  <button
                    onClick={() => apiKey && handleModeSwitch("openai")}
                    disabled={configLoading || embeddingMode === "openai" || !apiKey}
                    className={`w-full p-4 rounded-[1.25rem] border-2 transition-all text-left backdrop-blur-xl ${
                      embeddingMode === "openai"
                        ? "border-green-500 bg-green-500/20"
                        : "border-white/20 hover:border-green-500/50 bg-white/5"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      <div className="flex-1">
                        <h3 className="font-semibold text-white mb-1">OpenAI Mode</h3>
                        <p className="text-sm text-gray-400">True semantic search • Requires API key</p>
                      </div>
                      {embeddingMode === "openai" && (
                        <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>

                  {/* API Key Input */}
                  <div className="pl-9">
                    <label className="block text-sm font-medium text-gray-300 mb-2">OpenAI API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-proj-xxxxxxxxxxxxxxxxxxxxx"
                      className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-[0.75rem] text-white placeholder:text-gray-400 focus:outline-none focus:border-purple-500 focus:bg-white/10 transition-all backdrop-blur-xl"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Get your API key from{" "}
                      <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
                        platform.openai.com
                      </a>
                    </p>
                  </div>
                </div>
              </div>

              {/* Status Message */}
              {configMessage && (
                <div className={`p-4 rounded-[1rem] border backdrop-blur-xl ${
                  configMessage.type === "success"
                    ? "bg-green-500/20 border-green-500/50 text-green-300"
                    : "bg-red-500/20 border-red-500/50 text-red-300"
                } animate-slide-up`}>
                  <div className="flex items-center gap-2">
                    {configMessage.type === "success" ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    )}
                    <p className="text-sm font-medium">{configMessage.text}</p>
                  </div>
                </div>
              )}

              {/* Loading Indicator */}
              {configLoading && (
                <div className="flex items-center justify-center gap-2 text-gray-400">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Updating configuration...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }
        @keyframes twinkle {
          0%, 100% {
            opacity: 0.2;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }
        @keyframes comet {
          0% {
            transform: translate(0, 0) scale(0);
            opacity: 0;
          }
          10% {
            opacity: 1;
            transform: scale(1);
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translate(var(--comet-delta-x), var(--comet-delta-y)) scale(0);
            opacity: 0;
          }
        }
        @keyframes shimmer {
          0% {
            background-position: -200% center;
          }
          100% {
            background-position: 200% center;
          }
        }
        @keyframes glow {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.6;
          }
        }
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        .animate-comet {
          animation: comet var(--comet-duration) linear infinite;
          animation-delay: var(--comet-delay);
        }
        .animate-shimmer {
          animation: shimmer 6s ease-in-out infinite;
        }
        .animate-glow {
          animation: glow 4s ease-in-out infinite;
        }
        .animate-slide-up {
          animation: slide-up 0.5s ease-out forwards;
        }
        .animate-fade-in {
          animation: fade-in 1s ease-out;
        }
      `}</style>
    </main>
  );
}
