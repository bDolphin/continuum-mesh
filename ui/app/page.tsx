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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [rippleEffect, setRippleEffect] = useState<{id: string, x: number, y: number} | null>(null);
  const [pinnedMap, setPinnedMap] = useState<Record<string, MemoryResult>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState<string>("home");

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

  // Generate floating particles for hero section
  const heroParticles = useMemo(() => 
    Array.from({ length: 20 }, (_, i) => ({
      id: `particle-${i}`,
      size: 2 + seededRandom(i * 5000) * 3,
      left: seededRandom(i * 5001) * 100,
      top: seededRandom(i * 5002) * 100,
      opacity: seededRandom(i * 5003) * 0.15 + 0.05,
      duration: 8 + seededRandom(i * 5004) * 12,
      delay: seededRandom(i * 5005) * 5,
    })), []
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

  const toggleFilter = (filter: string) => {
    setActiveFilters(prev => 
      prev.includes(filter) 
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
  };

  const filterPills = [
    { id: 'chatgpt', label: 'ChatGPT', icon: '💬' },
    { id: 'perplexity', label: 'Perplexity', icon: '🔍' },
    { id: 'claude', label: 'Claude', icon: '🤖' },
    { id: 'today', label: 'Today', icon: '📅' },
    { id: 'this-week', label: 'This Week', icon: '📆' },
  ];

  const navItems = [
    { id: 'home', label: 'Home' },
    { id: 'memories', label: 'Memories' },
    { id: 'collections', label: 'Collections' },
    { id: 'filters', label: 'Filters' },
    { id: 'settings', label: 'Settings' },
    { id: 'analytics', label: 'Analytics' },
  ];

  const renderNavIcon = (id: string) => {
    switch (id) {
      case 'home':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4m4-11v11a1 1 0 001 1h4" />
          </svg>
        );
      case 'memories':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5a2 2 0 012-2h8l6 6v8a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" />
          </svg>
        );
      case 'collections':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7h18M3 12h14M3 17h10" />
          </svg>
        );
      case 'filters':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4h16l-6 7v5l-4 2v-7L4 4z" />
          </svg>
        );
      case 'settings':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      case 'analytics':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 19h16M5 17V9m5 8V5m5 12v-6m5 6V7" />
          </svg>
        );
      default:
        return null;
    }
  };

  const pinnedList = useMemo(() => Object.values(pinnedMap), [pinnedMap]);

  const extractKeywords = (text: string): string[] => {
    // Simple keyword extraction - get words longer than 4 characters
    const words = text.toLowerCase().match(/\b\w{5,}\b/g) || [];
    const uniqueWords = [...new Set(words)];
    return uniqueWords.slice(0, 5);
  };

  const handleCardClick = (e: React.MouseEvent, cardId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRippleEffect({ id: cardId, x, y });
    setTimeout(() => setRippleEffect(null), 600);
  };

  const togglePinMemory = (memory: MemoryResult) => {
    setPinnedMap((prev) => {
      const updated = { ...prev };
      if (updated[memory.id]) {
        delete updated[memory.id];
      } else {
        updated[memory.id] = memory;
      }
      return updated;
    });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    // Ensure we are in the default view when showing fresh search results
    if (activeNav !== 'home') {
      setActiveNav('home');
    }
    setLoading(true);
    setError(null);
    setShowSuggestions(false);
    
    // Add to recent searches if not empty
    if (query.trim() && !recentSearches.includes(query.trim())) {
      setRecentSearches(prev => [query.trim(), ...prev].slice(0, 5));
    }

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

      const trimmedQuery = query.trim().toLowerCase();
      const backendResults: MemoryResult[] = data.results ?? [];

      // If query is empty, trust backend ordering (already newest-first)
      if (!trimmedQuery) {
        setResults(backendResults);
        return;
      }

      // For non-empty queries (testing mode), apply simple text filter + timestamp sort
      let filteredResults = backendResults.filter((r: MemoryResult) => 
        r.content.toLowerCase().includes(trimmedQuery)
      );

      filteredResults.sort((a: MemoryResult, b: MemoryResult) => {
        const timeA = a.metadata?.timestamp ? new Date(a.metadata.timestamp).getTime() : 0;
        const timeB = b.metadata?.timestamp ? new Date(b.metadata.timestamp).getTime() : 0;
        return timeB - timeA; // Descending order (newest first)
      });
      
      setResults(filteredResults);
    } catch (err: any) {
      setError(err.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const isCollectionsView = activeNav === 'collections';
  const displayResults = isCollectionsView ? pinnedList : results;
  const hasNoResults = displayResults.length === 0;
  const shouldShowEmptyState = isCollectionsView ? (!error && hasNoResults) : (!loading && !error && hasNoResults);

  return (
    <main className="min-h-screen relative overflow-hidden flex flex-col items-center p-8">
      {/* Side Navigation - fixed, collapsible */}
      <div className="fixed left-4 top-1/2 -translate-y-1/2 z-30 hidden sm:block">
        <div
          className={`relative group transition-all duration-300 ${
            sidebarCollapsed ? 'w-14' : 'w-60'
          }`}
        >
          {/* Gradient border */}
          <div className="absolute -inset-0.5 bg-gradient-to-b from-purple-500 via-pink-500 to-cyan-500 rounded-[1.75rem] blur-xl opacity-40 group-hover:opacity-70 transition" />

          {/* Sidebar container */}
          <div className="relative bg-slate-950/80 backdrop-blur-2xl border border-white/15 rounded-[1.5rem] shadow-2xl shadow-black/40 px-3 py-4 flex flex-col gap-3">
            {/* Header + collapse toggle */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/40">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 3a9 9 0 010 18" />
                  </svg>
                </div>
                {!sidebarCollapsed && (
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold tracking-widest text-gray-400 uppercase">Context</span>
                    <span className="text-sm font-semibold text-gray-100">Memory Mesh</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-gray-300 hover:text-white transition-all duration-200 hover:scale-105 active:scale-95"
              >
                <svg
                  className={`w-4 h-4 transform transition-transform duration-300 ${
                    sidebarCollapsed ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>

            {/* Nav items */}
            <nav className="mt-1 space-y-1.5">
              {navItems.map((item) => {
                const active = activeNav === item.id;
                const collapsedClasses = sidebarCollapsed
                  ? 'justify-center px-1 py-2'
                  : 'gap-3 px-3 py-2';
                const showPinnedBadge = item.id === 'collections' && pinnedList.length > 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveNav(item.id)}
                    className={`relative w-full flex items-center ${collapsedClasses} rounded-xl text-sm font-medium transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-r from-purple-500/70 to-cyan-500/70 text-white shadow-lg shadow-purple-500/30 border border-white/40'
                        : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10'
                    }`}
                  >
                    <span className={`flex items-center justify-center rounded-lg bg-black/40 ${
                      sidebarCollapsed ? 'w-9 h-9' : 'w-7 h-7'
                    }`}>
                      {renderNavIcon(item.id)}
                    </span>
                    {!sidebarCollapsed && (
                      <span className="truncate flex-1">{item.label}</span>
                    )}
                    {showPinnedBadge && (
                      <span
                        className={`${
                          sidebarCollapsed ? 'absolute -top-1 -right-1' : 'ml-2'
                        } inline-flex items-center justify-center rounded-full bg-white/20 text-white text-[10px] font-semibold px-2 py-0.5`}
                      >
                        {pinnedList.length}
                      </span>
                    )}
                    {active && !sidebarCollapsed && (
                      <span className="ml-2 inline-flex items-center justify-center w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </div>
      {/* Animated gradient background - Deep space with parallax nebula */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-black via-slate-950 to-black">
        {/* Parallax nebula layers */}
        <div className="absolute top-0 -left-4 w-[600px] h-[600px] bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-nebula-slow"></div>
        <div className="absolute top-0 -right-4 w-[500px] h-[500px] bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-nebula-medium"></div>
        <div className="absolute -bottom-8 left-20 w-[550px] h-[550px] bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-nebula-fast"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-5 animate-nebula-slow"></div>
        
        {/* Soft gradient waves */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-500/10 animate-wave-slow"></div>
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tl from-pink-500/10 via-transparent to-indigo-500/10 animate-wave-medium"></div>
        </div>
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

      {/* Ultra-light floating particles in hero area */}
      {mounted && (
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-[600px] overflow-hidden pointer-events-none z-0">
        {heroParticles.map((particle) => (
          <div
            key={particle.id}
            className="absolute bg-white rounded-full"
            style={{
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              opacity: particle.opacity,
              animation: `float-particle ${particle.duration}s ease-in-out infinite`,
              animationDelay: `${particle.delay}s`,
              boxShadow: '0 0 10px rgba(255,255,255,0.3)',
            }}
          />
        ))}
      </div>
      )}

      {/* Header with glassmorphism hero card */}
      <div className="text-center mb-12 mt-8 z-10 relative">
        {/* Glassmorphism hero card behind content */}
        <div className="absolute inset-0 -inset-x-20 -inset-y-10 bg-white/[0.02] backdrop-blur-3xl rounded-[3rem] border border-white/10 shadow-2xl shadow-purple-500/10 -z-10"></div>
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
        <h1 className="relative text-6xl font-black mb-3">
          <span className="relative inline-block bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent animate-shimmer bg-[length:200%_100%]">
            Context Memory Mesh
          </span>
          {/* Glowing effect */}
          <span className="absolute inset-0 bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent blur-xl opacity-50 animate-glow">
            Context Memory Mesh
          </span>
        </h1>
        
        {/* Product value tagline */}
        <p className="text-xl font-light text-gray-200 mb-4 tracking-wide">
          <span className="bg-gradient-to-r from-purple-300 via-pink-300 to-cyan-300 bg-clip-text text-transparent">
            Your personal knowledge layer — searchable, semantic, supercharged.
          </span>
        </p>
        
        <p className="text-base text-gray-400 max-w-2xl mx-auto leading-relaxed">
          <span className="inline-flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Explore your local memories with AI-powered semantic search
          </span>
        </p>
        {/* Enhanced Top Bar Utilities with Glow Badges */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
          {/* Port Status Badge with Glow */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full blur opacity-40 group-hover:opacity-60 transition duration-300"></div>
            <div className="relative flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-xl border-2 border-green-400/30 shadow-lg shadow-green-500/20">
              {/* Animated pulse dot */}
              <div className="relative flex items-center justify-center">
                <div className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse"></div>
                <div className="absolute w-2.5 h-2.5 bg-green-400 rounded-full animate-ping"></div>
              </div>
              {/* Server icon */}
              <svg className="w-4 h-4 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
              <span className="text-green-200 font-semibold tracking-wide">Port 2789</span>
            </div>
          </div>

          {/* Mode Toggle Badge with Animation */}
          <div className="relative group">
            <div className={`absolute -inset-0.5 rounded-full blur transition-all duration-500 ${
              embeddingMode === "testing" 
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 opacity-40 group-hover:opacity-60' 
                : 'bg-gradient-to-r from-purple-500 to-pink-500 opacity-40 group-hover:opacity-60'
            }`}></div>
            <button
              onClick={() => setShowSettings(true)}
              className={`relative flex items-center gap-2.5 px-5 py-2.5 rounded-full backdrop-blur-xl border-2 shadow-lg transition-all duration-300 hover:scale-105 ${
                embeddingMode === "testing"
                  ? 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-400/30 shadow-blue-500/20'
                  : 'bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-400/30 shadow-purple-500/20'
              }`}
            >
              {/* Toggle switch animation */}
              <div className={`relative w-10 h-5 rounded-full transition-all duration-300 ${
                embeddingMode === "testing" ? 'bg-blue-500/30' : 'bg-purple-500/30'
              }`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full shadow-lg transition-all duration-300 ${
                  embeddingMode === "testing" 
                    ? 'left-0.5 bg-blue-400' 
                    : 'left-5 bg-purple-400'
                }`}></div>
              </div>
              
              {/* Mode icon */}
              {embeddingMode === "testing" ? (
                <svg className="w-4 h-4 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              )}
              
              <span className={`font-semibold tracking-wide ${
                embeddingMode === "testing" ? 'text-blue-200' : 'text-purple-200'
              }`}>
                {embeddingMode === "testing" ? "Testing Mode" : embeddingMode === "openai" ? "OpenAI Mode" : embeddingMode}
              </span>
            </button>
          </div>

          {/* Settings Button with Gradient Border */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 rounded-full blur opacity-40 group-hover:opacity-70 transition duration-300"></div>
            <button
              onClick={() => setShowSettings(true)}
              className="relative flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-cyan-500/20 backdrop-blur-xl border-2 border-purple-400/30 hover:border-purple-400/50 shadow-lg shadow-purple-500/20 transition-all duration-300 hover:scale-105 active:scale-95"
            >
              {/* Rotating gear icon on hover */}
              <svg className="w-4 h-4 text-purple-300 group-hover:rotate-90 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-purple-200 font-semibold tracking-wide">Settings</span>
            </button>
          </div>
        </div>
      </div>

      {/* Enhanced Search Bar with Neumorphic/Glass Effects */}
      <div className="w-full max-w-3xl mb-6 z-10">
        <form onSubmit={handleSearch} className="relative">
          {/* Gradient border glow */}
          <div className={`absolute -inset-1 bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 rounded-[2rem] blur-xl transition-all duration-500 ${
            searchFocused ? 'opacity-70' : 'opacity-30'
          }`}></div>
          
          {/* Main search container with neumorphic glass effect */}
          <div className={`relative flex gap-3 bg-gradient-to-br from-white/[0.12] to-white/[0.08] backdrop-blur-3xl border-2 rounded-[2rem] p-3 shadow-2xl transition-all duration-300 ${
            searchFocused 
              ? 'border-purple-400/50 shadow-purple-500/30 shadow-[0_0_40px_rgba(168,85,247,0.4)]' 
              : 'border-white/20 hover:border-white/30'
          }`} style={{
            boxShadow: searchFocused 
              ? '0 20px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.1), 0 0 40px rgba(168,85,247,0.4)'
              : '0 20px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.1)'
          }}>
            <div className="flex-1 flex items-center gap-3 px-5 py-1">
              <svg
                className={`w-5 h-5 transition-colors duration-300 ${searchFocused ? 'text-purple-400' : 'text-gray-400'}`}
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
                onFocus={() => {
                  setSearchFocused(true);
                  setShowSuggestions(true);
                }}
                onBlur={() => {
                  setSearchFocused(false);
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
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

          {/* Floating Suggestions Dropdown */}
          {showSuggestions && (
            <div className="absolute top-full mt-3 left-0 right-0 bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-2xl border border-white/20 rounded-[1.5rem] shadow-2xl shadow-black/50 overflow-hidden animate-slide-up z-50">
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div className="p-4 border-b border-white/10">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Recent Searches
                  </div>
                  <div className="space-y-1">
                    {recentSearches.map((search, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSuggestionClick(search)}
                        className="w-full text-left px-3 py-2 rounded-xl text-gray-300 hover:bg-white/10 hover:text-white transition-all duration-200 flex items-center gap-2 group"
                      >
                        <svg className="w-4 h-4 text-gray-500 group-hover:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span className="text-sm">{search}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Smart Suggestions */}
              <div className="p-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Quick Filters
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => handleSuggestionClick('chatgpt')} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all text-sm text-left">
                    💬 ChatGPT conversations
                  </button>
                  <button type="button" onClick={() => handleSuggestionClick('perplexity')} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all text-sm text-left">
                    🔍 Perplexity searches
                  </button>
                  <button type="button" onClick={() => handleSuggestionClick('today')} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all text-sm text-left">
                    📅 Today's memories
                  </button>
                  <button type="button" onClick={() => handleSuggestionClick('this week')} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all text-sm text-left">
                    📆 This week
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>

        {/* Semantic Filter Pills */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filters:</span>
          {filterPills.map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => toggleFilter(pill.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                activeFilters.includes(pill.id)
                  ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-lg shadow-purple-500/30 scale-105'
                  : 'bg-white/10 backdrop-blur-xl border border-white/20 text-gray-300 hover:bg-white/15 hover:border-white/30 hover:scale-105'
              }`}
            >
              <span>{pill.icon}</span>
              <span>{pill.label}</span>
              {activeFilters.includes(pill.id) && (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
          {activeFilters.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilters([])}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition-all duration-200"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear all
            </button>
          )}
        </div>
      </div>

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

      {/* Enhanced Memory Cards with Depth & Elevation */}
      <div className="w-full max-w-3xl space-y-5 z-10 pb-20">
        {displayResults.map((r, index) => {
          const keywords = extractKeywords(r.content);
          const isHovered = hoveredCardId === r.id;
          const isPinned = Boolean(pinnedMap[r.id]);
          
          return (
          <div
            key={r.id}
            className="group animate-slide-up"
            style={{ animationDelay: `${index * 100}ms` }}
            onMouseEnter={() => setHoveredCardId(r.id)}
            onMouseLeave={() => setHoveredCardId(null)}
          >
            <div className="relative">
              {/* Gradient border glow - Apple Vision Pro style */}
              <div className={`absolute -inset-[1px] bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 rounded-[1.75rem] opacity-0 transition-all duration-500 ${
                isHovered ? 'opacity-40 blur-md' : 'blur-lg'
              }`}></div>
              
              {/* Main card with depth hierarchy */}
              <div 
                className={`relative bg-gradient-to-br from-white/[0.12] to-white/[0.08] backdrop-blur-3xl border-2 rounded-[1.5rem] p-6 transition-all duration-300 overflow-hidden ${
                  isHovered 
                    ? 'border-purple-400/40 shadow-2xl translate-y-[-4px]' 
                    : 'border-white/20 shadow-lg'
                }`}
                style={{
                  boxShadow: isHovered
                    ? '0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(168,85,247,0.2), inset 0 1px 0 rgba(255,255,255,0.1)'
                    : '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)'
                }}
                onClick={(e) => handleCardClick(e, r.id)}
              >
                {/* Ripple effect */}
                {rippleEffect?.id === r.id && (
                  <span
                    className="absolute rounded-full bg-white/30 animate-ripple pointer-events-none"
                    style={{
                      left: rippleEffect.x,
                      top: rippleEffect.y,
                      width: '20px',
                      height: '20px',
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                )}
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
                          {new Date(r.metadata.timestamp).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
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
                    
                    {/* Enhanced Action Buttons with Micro-interactions */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        onClick={(e) => handleCopyToClipboard(r.content, r.id, e)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                          isHovered 
                            ? 'bg-purple-500/30 border-2 border-purple-400/50 text-purple-200 shadow-lg shadow-purple-500/20 scale-105' 
                            : 'bg-purple-500/20 border border-purple-500/30 text-purple-300'
                        } hover:scale-110 active:scale-95`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Copy</span>
                      </button>

                      <button
                        onClick={() => toggleExpand(r.id)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                          isHovered 
                            ? 'bg-cyan-500/30 border-2 border-cyan-400/50 text-cyan-200 shadow-lg shadow-cyan-500/20 scale-105' 
                            : 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-300'
                        } hover:scale-110 active:scale-95`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {expandedIds.has(r.id) ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          )}
                        </svg>
                        <span>{expandedIds.has(r.id) ? 'Collapse' : 'Expand'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => togglePinMemory(r)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                          isPinned
                            ? 'bg-pink-500/40 border-2 border-pink-400/60 text-white shadow-lg shadow-pink-500/30 scale-105'
                            : isHovered
                              ? 'bg-pink-500/30 border-2 border-pink-400/50 text-pink-200 shadow-lg shadow-pink-500/20 scale-105'
                              : 'bg-pink-500/20 border border-pink-500/30 text-pink-300'
                        } hover:scale-110 active:scale-95`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        <span>{isPinned ? 'Unpin' : 'Pin'}</span>
                      </button>
                    </div>
                    
                    {/* Copy Success Indicator */}
                    {copiedId === r.id && (
                      <div className="mt-3 flex items-center gap-2 text-green-400 text-sm animate-fade-in">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium">Copied to clipboard!</span>
                      </div>
                    )}

                    {/* Hover Preview Panel */}
                    <div
                      className={`mt-4 transition-all duration-500 ease-out ${
                        isHovered
                          ? 'opacity-100 translate-y-0 max-h-64 pointer-events-auto'
                          : 'opacity-0 -translate-y-2 max-h-0 pointer-events-none'
                      }`}
                    >
                      <div className="p-4 bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden">
                        <div className="space-y-3 text-sm">
                          {/* Summary */}
                          <div>
                            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Summary
                            </div>
                            <p className="text-sm text-gray-300 line-clamp-2">{r.content.slice(0, 120)}...</p>
                          </div>

                          {/* Keywords */}
                          {keywords.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                </svg>
                                Keywords
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {keywords.map((keyword, idx) => (
                                  <span key={idx} className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-lg border border-purple-500/30">
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Tags & Source */}
                          <div className="flex items-center gap-3 pt-2 border-t border-white/10">
                            <div className="flex items-center gap-1.5">
                              <svg className="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                              </svg>
                              <span className="text-xs text-gray-400">Source:</span>
                              <span className="text-xs font-medium text-cyan-300 capitalize">{r.metadata?.source_app || 'Unknown'}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              <span className="text-xs text-gray-400">Score:</span>
                              <span className="text-xs font-medium text-yellow-300">{r.score.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          );
        })}

        {shouldShowEmptyState && (
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
              {isCollectionsView ? 'No bookmarks found' : 'No memories found'}
            </h3>
            <p className="text-gray-500 max-w-md mx-auto">
              {isCollectionsView
                ? 'Use the Pin action on any answer to save it to Collections.'
                : 'Start searching to explore your knowledge base. The daemon will return relevant memories based on your query.'}
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
