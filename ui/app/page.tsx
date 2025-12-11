"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
};

const listVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
  },
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [analyticsMemories, setAnalyticsMemories] = useState<MemoryResult[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<"all" | "today" | "week" | "30d">("week");
  const [theme, setTheme] = useState<"dark" | "dawn">("dark");

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

  useEffect(() => {
    if (activeNav !== "analytics") {
      return;
    }

    if (analyticsMemories.length > 0 || analyticsLoading) {
      return;
    }

    const fetchAnalyticsMemories = async () => {
      try {
        setAnalyticsLoading(true);
        setAnalyticsError(null);

        const params = new URLSearchParams({
          query: "",
          n_results: "1000",
        });

        const res = await fetch(
          `http://127.0.0.1:2789/recall?${params.toString()}`
        );

        if (!res.ok) {
          throw new Error(`Daemon error: ${res.status}`);
        }

        const data = await res.json();
        const backendResults: MemoryResult[] = data.results ?? [];
        setAnalyticsMemories(backendResults);
      } catch (err: any) {
        setAnalyticsError(err.message ?? "Unknown error");
      } finally {
        setAnalyticsLoading(false);
      }
    };

    fetchAnalyticsMemories();
  }, [activeNav, analyticsMemories.length, analyticsLoading]);

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

  // Generate glowing grid nodes for Neon Semantic Grid
  const gridNodes = useMemo(() => 
    Array.from({ length: 12 }, (_, i) => ({
      id: `node-${i}`,
      left: seededRandom(i * 5000) * 100,
      top: seededRandom(i * 5001) * 100,
      size: 3 + seededRandom(i * 5002) * 4,
      opacity: 0.3 + seededRandom(i * 5003) * 0.5,
      pulseDelay: seededRandom(i * 5004) * 4,
      pulseDuration: 3 + seededRandom(i * 5005) * 3,
      color: ['#a78bfa', '#60a5fa', '#f0abfc', '#22d3ee'][Math.floor(seededRandom(i * 5006) * 4)],
    })), []
  );

  // Generate drifting particles for semantic grid
  const driftingParticles = useMemo(() => 
    Array.from({ length: 25 }, (_, i) => ({
      id: `drift-${i}`,
      startX: seededRandom(i * 6000) * 100,
      startY: seededRandom(i * 6001) * 100,
      size: 1 + seededRandom(i * 6002) * 2,
      opacity: 0.2 + seededRandom(i * 6003) * 0.4,
      driftX: (seededRandom(i * 6004) - 0.5) * 30,
      driftY: (seededRandom(i * 6005) - 0.5) * 30,
      duration: 40 + seededRandom(i * 6006) * 40, // Very slow drift
      delay: seededRandom(i * 6007) * 20,
    })), []
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

  const isDawn = theme === "dawn";

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

  const resetToHome = () => {
    setActiveNav('home');
    setQuery('');
    setResults([]);
    setError(null);
    setShowSuggestions(false);
    setSearchFocused(false);
    setActiveFilters([]);
    setHoveredCardId(null);
    setRippleEffect(null);
    setExpandedIds(new Set());
    setLoading(false);
  };

  const renderNavIcon = (id: string) => {
    switch (id) {
      case 'home':
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              d="M4 9.5L12 4l8 5.5V20a1 1 0 01-1 1h-4.5a1 1 0 01-1-1v-4.5h-5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M10.5 21v-5.5h3V21" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'memories':
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="5" y="4" width="14" height="16" rx="2.5" strokeWidth="1.6" />
            <path d="M9 4v2.5a1.5 1.5 0 001.5 1.5h3A1.5 1.5 0 0015 6.5V4" strokeWidth="1.6" />
            <path d="M8.5 11.5h7M8.5 15.5h4" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="9" cy="11.5" r="0.5" fill="currentColor" />
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

  const analyticsStats = useMemo(() => {
    if (analyticsMemories.length === 0) {
      return {
        totalMemories: 0,
        todayCount: 0,
        weekCount: 0,
        pinnedCount: pinnedList.length,
        sourceCounts: [] as { source: string; count: number }[],
        tagCounts: [] as { tag: string; count: number }[],
        recentSearchCount: recentSearches.length,
        latestActivity: null as string | null,
      };
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfThisWeek = new Date(startOfToday);
    startOfThisWeek.setDate(startOfThisWeek.getDate() - 6);

    const startOfThirtyDays = new Date(startOfToday);
    startOfThirtyDays.setDate(startOfThirtyDays.getDate() - 29);

    let rangeStart: Date | null = null;
    if (analyticsRange === "today") {
      rangeStart = startOfToday;
    } else if (analyticsRange === "week") {
      rangeStart = startOfThisWeek;
    } else if (analyticsRange === "30d") {
      rangeStart = startOfThirtyDays;
    }

    let totalMemories = 0;
    let todayCount = 0;
    let weekCount = 0;
    const sourceMap: Record<string, number> = {};
    const tagMap: Record<string, number> = {};
    let latestActivityTime = 0;
    let latestActivity: string | null = null;

    analyticsMemories.forEach((memory) => {
      const tsString = memory.metadata?.timestamp;
      let ts: Date | null = null;
      let includeInRange = true;

      if (tsString) {
        ts = new Date(tsString);
        if (Number.isNaN(ts.getTime())) {
          includeInRange = false;
        }
      } else if (rangeStart) {
        includeInRange = false;
      }

      if (rangeStart && ts && ts < rangeStart) {
        includeInRange = false;
      }

      if (!includeInRange) {
        return;
      }

      totalMemories += 1;

      if (ts) {
        if (ts >= startOfToday) {
          todayCount += 1;
        }
        if (ts >= startOfThisWeek) {
          weekCount += 1;
        }
        const time = ts.getTime();
        if (time > latestActivityTime) {
          latestActivityTime = time;
          latestActivity = ts.toLocaleString();
        }
      }

      const rawSource = memory.metadata?.source_app || "Unknown";
      const sourceKey = rawSource.toLowerCase().trim() || "unknown";
      if (sourceKey) {
        sourceMap[sourceKey] = (sourceMap[sourceKey] || 0) + 1;
      }

      const tagsValue = memory.metadata?.tags;
      if (tagsValue) {
        tagsValue
          .split(/[,#]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .forEach((tag) => {
            const key = tag.toLowerCase();
            tagMap[key] = (tagMap[key] || 0) + 1;
          });
      }
    });

    const sourceCounts = Object.entries(sourceMap)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const tagCounts = Object.entries(tagMap)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      totalMemories,
      todayCount,
      weekCount,
      pinnedCount: pinnedList.length,
      sourceCounts,
      tagCounts,
      recentSearchCount: recentSearches.length,
      latestActivity,
    };
  }, [analyticsMemories, pinnedList, recentSearches, analyticsRange]);

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
    setFiltersOpen(true);
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

      // Start from backend results
      let filteredResults = backendResults;

      // Text filter: only apply when query is non-empty
      if (trimmedQuery) {
        filteredResults = filteredResults.filter((r: MemoryResult) =>
          r.content.toLowerCase().includes(trimmedQuery)
        );
      }

      // Preserve post-text-filter results for potential fallback
      const afterTextFilter = filteredResults;

      // Source filters: ChatGPT / Perplexity / Claude
      const hasSourceFilter = activeFilters.some((f) =>
        ["chatgpt", "perplexity", "claude"].includes(f)
      );

      const applySourceFilters = (input: MemoryResult[]): MemoryResult[] => {
        if (!hasSourceFilter) return input;

        return input.filter((r: MemoryResult) => {
          const source = r.metadata?.source_app?.toLowerCase() || "";
          if (!source) return false;

          if (activeFilters.includes("chatgpt") && source.includes("chatgpt")) {
            return true;
          }
          if (activeFilters.includes("perplexity") && source.includes("perplex")) {
            return true;
          }
          if (activeFilters.includes("claude") && source.includes("claude")) {
            return true;
          }
          return false;
        });
      };

      // Date filters: Today / This Week
      const hasDateFilter = activeFilters.some((f) =>
        ["today", "this-week"].includes(f)
      );

      const applyDateFilters = (input: MemoryResult[]): MemoryResult[] => {
        if (!hasDateFilter) return input;

        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        const startOfThisWeek = new Date(startOfToday);
        startOfThisWeek.setDate(startOfThisWeek.getDate() - 6);

        return input.filter((r: MemoryResult) => {
          if (!r.metadata?.timestamp) return false;
          const ts = new Date(r.metadata.timestamp);

          let matches = false;
          if (activeFilters.includes("today")) {
            matches = ts >= startOfToday;
          }
          if (!matches && activeFilters.includes("this-week")) {
            matches = ts >= startOfThisWeek;
          }
          return matches;
        });
      };

      // Apply provider + date filters to primary results
      filteredResults = applyDateFilters(applySourceFilters(filteredResults));

      // If we have a query, source filter, and nothing after both filters, fall back to
      // just applying provider/date filters on the post-text-filter set
      if (trimmedQuery && hasSourceFilter && filteredResults.length === 0) {
        filteredResults = applyDateFilters(applySourceFilters(afterTextFilter));
      }

      // Lexical fallback across a larger result set
      if (trimmedQuery && filteredResults.length === 0) {
        try {
          const fallbackParams = new URLSearchParams({
            query: "",
            n_results: "1000",
          });

          const fallbackRes = await fetch(
            `http://127.0.0.1:2789/recall?${fallbackParams.toString()}`
          );

          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            const allResults: MemoryResult[] = fallbackData.results ?? [];

            let lexicalResults = allResults.filter((r: MemoryResult) =>
              r.content.toLowerCase().includes(trimmedQuery)
            );

            // Always enforce provider + date filters even on lexical fallback
            lexicalResults = applyDateFilters(applySourceFilters(lexicalResults));
            filteredResults = lexicalResults;
          }
        } catch (fallbackErr) {
          // Swallow fallback errors to avoid masking the original search
        }
      }

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
  const isAnalyticsView = activeNav === 'analytics';

  const displayResults = useMemo(() => {
    if (isCollectionsView) {
      return pinnedList;
    }

    let output = results;

    const hasSourceFilterView = activeFilters.some((f) =>
      ["chatgpt", "perplexity", "claude"].includes(f)
    );

    if (hasSourceFilterView) {
      output = output.filter((r: MemoryResult) => {
        const source = r.metadata?.source_app?.toLowerCase() || "";
        if (!source) return false;

        if (activeFilters.includes("chatgpt") && source.includes("chatgpt")) {
          return true;
        }
        if (activeFilters.includes("perplexity") && source.includes("perplex")) {
          return true;
        }
        if (activeFilters.includes("claude") && source.includes("claude")) {
          return true;
        }
        return false;
      });
    }

    const hasDateFilterView = activeFilters.some((f) =>
      ["today", "this-week"].includes(f)
    );

    if (hasDateFilterView) {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);

      const startOfThisWeek = new Date(startOfToday);
      startOfThisWeek.setDate(startOfThisWeek.getDate() - 6);

      output = output.filter((r: MemoryResult) => {
        if (!r.metadata?.timestamp) return false;
        const ts = new Date(r.metadata.timestamp);

        let matches = false;
        if (activeFilters.includes("today")) {
          matches = ts >= startOfToday;
        }
        if (!matches && activeFilters.includes("this-week")) {
          matches = ts >= startOfThisWeek;
        }
        return matches;
      });
    }

    return output;
  }, [results, pinnedList, activeFilters, isCollectionsView]);

  const hasNoResults = displayResults.length === 0;
  const shouldShowEmptyState = !isAnalyticsView && (
    isCollectionsView
      ? (!error && hasNoResults)
      : (!loading && !error && hasNoResults && !showSuggestions)
  );

  return (
    <motion.main
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.45, ease: "easeOut" }}
      className={`min-h-screen relative overflow-hidden flex flex-col items-center p-8 ${
        isDawn ? "text-slate-900" : "text-white"
      }`}
    >
      {/* Side Navigation - fixed, collapsible */}
      <div className="fixed left-4 top-1/2 -translate-y-1/2 z-30 hidden sm:block">
        <div
          className={`relative group transition-all duration-300 ${
            sidebarCollapsed ? 'w-20' : 'w-60'
          }`}
        >
          {/* Gradient border */}
          <div className="absolute -inset-0.5 bg-gradient-to-b from-purple-500 via-pink-500 to-cyan-500 rounded-[1.75rem] blur-xl opacity-40 group-hover:opacity-70 transition" />
          {/* Sidebar container */}
          <div
            className={`relative backdrop-blur-2xl rounded-[1.5rem] px-3 py-4 flex flex-col gap-3 ${
              isDawn
                ? 'bg-white/90 border border-slate-200/80 shadow-xl shadow-purple-200/60'
                : 'bg-slate-950/80 border border-white/15 shadow-2xl shadow-black/40'
            }`}
          >
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
                    <span
                      className={`text-sm font-semibold ${
                        isDawn ? 'text-slate-800' : 'text-gray-100'
                      }`}
                    >
                      Memory Mesh
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                className={`inline-flex items-center justify-center w-8 h-8 rounded-2xl border transition-all duration-200 hover:scale-105 active:scale-95 ${
                  isDawn
                    ? 'bg-slate-100/90 hover:bg-slate-200 border-slate-300 text-slate-500 hover:text-slate-800 shadow-sm'
                    : 'bg-white/5 hover:bg-white/10 border-white/15 text-gray-300 hover:text-white'
                }`}
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
                  ? 'justify-center px-0 py-1.5 h-14'
                  : 'gap-3 px-3 py-2';
                const showPinnedBadge = item.id === 'collections' && pinnedList.length > 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'home') {
                        resetToHome();
                        setFiltersOpen(false);
                      } else if (item.id === 'filters') {
                        setActiveNav(item.id);
                        setFiltersOpen((prev) => !prev);
                      } else {
                        setActiveNav(item.id);
                        setFiltersOpen(false);
                      }
                    }}
                    className={`relative w-full flex items-center ${collapsedClasses} rounded-xl text-sm font-medium transition-all duration-200 ${
                      active
                        ? isDawn
                          ? 'bg-gradient-to-r from-purple-400 to-cyan-400 text-white shadow-lg shadow-purple-300/50 border border-purple-200/80'
                          : 'bg-gradient-to-r from-purple-500/70 to-cyan-500/70 text-white shadow-lg shadow-purple-500/30 border border-white/40'
                        : isDawn
                          ? 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200'
                          : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10'
                    }`}
                  >
                    <span
                      className={`flex items-center justify-center ${
                        sidebarCollapsed
                          ? 'w-11 h-11 rounded-full bg-transparent'
                          : 'w-7 h-7 rounded-lg bg-black/40'
                      }`}
                    >
                      {renderNavIcon(item.id)}
                    </span>
                    {!sidebarCollapsed && (
                      <span className="truncate flex-1">{item.label}</span>
                    )}
                    {showPinnedBadge && (
                      <span
                        className={`${
                          sidebarCollapsed ? 'absolute -top-1 -right-1' : 'ml-2'
                        } inline-flex items-center justify-center rounded-full text-[10px] font-semibold px-2 py-0.5 ${
                          isDawn
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : 'bg-white/20 text-white'
                        }`}
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
      <div
        className={`fixed inset-0 -z-10 bg-gradient-to-br ${
          isDawn
            ? 'from-[#fef3ff] via-[#f9fafb] to-[#e0f2fe]'
            : 'from-[#020617] via-slate-900 to-slate-950'
        }`}
      >
        {/* Parallax nebula layers */}
        <div
          className={`absolute top-0 -left-4 w-[600px] h-[600px] rounded-full mix-blend-multiply filter blur-3xl animate-nebula-slow ${
            isDawn ? 'opacity-10 bg-purple-300' : 'opacity-30 bg-purple-500'
          }`}
        ></div>
        <div
          className={`absolute top-0 -right-4 w-[500px] h-[500px] rounded-full mix-blend-multiply filter blur-3xl animate-nebula-medium ${
            isDawn ? 'opacity-10 bg-cyan-300' : 'opacity-25 bg-cyan-500'
          }`}
        ></div>
        <div
          className={`absolute -bottom-8 left-20 w-[550px] h-[550px] rounded-full mix-blend-multiply filter blur-3xl animate-nebula-fast ${
            isDawn ? 'opacity-10 bg-indigo-300' : 'opacity-20 bg-indigo-500'
          }`}
        ></div>
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full mix-blend-multiply filter blur-3xl animate-nebula-slow ${
            isDawn ? 'opacity-5 bg-pink-300' : 'opacity-20 bg-pink-500'
          }`}
        ></div>
        
        {/* Soft gradient waves */}
        <div className={`absolute inset-0 ${isDawn ? 'opacity-20' : 'opacity-30'}`}>
          <div
            className={`absolute top-0 left-0 w-full h-full bg-gradient-to-br animate-wave-slow ${
              isDawn
                ? 'from-purple-300/40 via-transparent to-cyan-300/40'
                : 'from-purple-500/20 via-transparent to-cyan-500/20'
            }`}
          ></div>
          <div
            className={`absolute top-0 left-0 w-full h-full bg-gradient-to-tl animate-wave-medium ${
              isDawn
                ? 'from-pink-300/40 via-transparent to-indigo-300/40'
                : 'from-pink-500/20 via-transparent to-indigo-500/20'
            }`}
          ></div>
        </div>
      </div>

      {/* Neon Semantic Grid - Vercel/Midjourney style */}
      <div className="fixed inset-0 -z-5 pointer-events-none overflow-hidden">
        {/* SVG Grid Pattern */}
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="semantic-grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path
                d="M 60 0 L 0 0 0 60"
                fill="none"
                stroke={isDawn ? 'rgba(148, 163, 184, 0.08)' : 'rgba(255, 255, 255, 0.04)'}
                strokeWidth="1"
              />
            </pattern>
            <radialGradient id="grid-fade" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor="white" stopOpacity="1" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
            <mask id="grid-mask">
              <rect width="100%" height="100%" fill="url(#grid-fade)" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="url(#semantic-grid)" mask="url(#grid-mask)" />
        </svg>

        {/* Glowing Grid Nodes */}
        {mounted && gridNodes.map((node) => (
          <div
            key={node.id}
            className="absolute rounded-full"
            style={{
              left: `${node.left}%`,
              top: `${node.top}%`,
              width: `${node.size}px`,
              height: `${node.size}px`,
              backgroundColor: node.color,
              boxShadow: `0 0 ${node.size * 3}px ${node.size}px ${node.color}`,
              opacity: node.opacity,
              animation: `gridNodePulse ${node.pulseDuration}s ease-in-out infinite`,
              animationDelay: `${node.pulseDelay}s`,
            }}
          />
        ))}

        {/* Drifting Particles */}
        {mounted && driftingParticles.map((particle) => (
          <div
            key={particle.id}
            className="absolute rounded-full bg-white"
            style={{
              left: `${particle.startX}%`,
              top: `${particle.startY}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              opacity: particle.opacity,
              animation: `particleDrift ${particle.duration}s linear infinite`,
              animationDelay: `${particle.delay}s`,
            }}
          />
        ))}

        {/* Subtle connection lines between nearby nodes */}
        <svg className="absolute inset-0 w-full h-full" style={{ opacity: isDawn ? 0.06 : 0.03 }}>
          {mounted && gridNodes.slice(0, 8).map((node, i) => {
            const nextNode = gridNodes[(i + 1) % gridNodes.length];
            return (
              <line
                key={`line-${node.id}`}
                x1={`${node.left}%`}
                y1={`${node.top}%`}
                x2={`${nextNode.left}%`}
                y2={`${nextNode.top}%`}
                stroke={isDawn ? '#94a3b8' : '#ffffff'}
                strokeWidth="1"
                strokeDasharray="4 8"
                className="animate-pulse"
              />
            );
          })}
        </svg>
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
        <div
          className={`pointer-events-none absolute -inset-x-32 -inset-y-6 rounded-[3.5rem] -z-20 blur-2xl ${
            isDawn ? 'opacity-70' : 'opacity-40'
          }`}
          style={{
            backgroundImage:
              'radial-gradient(circle at 0% 50%, rgba(244,114,182,0.9), transparent 60%), radial-gradient(circle at 100% 50%, rgba(56,189,248,0.9), transparent 60%)',
            mixBlendMode: isDawn ? 'multiply' : 'screen',
          }}
        ></div>
        {/* Glassmorphism hero card behind content */}
        <div
          className={`absolute inset-0 -inset-x-20 -inset-y-10 backdrop-blur-3xl rounded-[3rem] border -z-10 ${
            isDawn
              ? 'bg-white/80 border-slate-200 shadow-2xl shadow-slate-300/70'
              : 'bg-gradient-to-br from-black via-slate-950 to-slate-900 border-slate-800/80 shadow-[0_40px_140px_rgba(0,0,0,0.95)]'
          }`}
        ></div>
        <div
          className={`inline-flex items-center justify-center w-20 h-20 mb-6 rounded-[1.5rem] bg-gradient-to-br shadow-2xl animate-float ${
            isDawn
              ? 'from-purple-400 to-cyan-400 shadow-purple-300/60'
              : 'from-purple-500 to-cyan-500 shadow-purple-500/50'
          }`}
        >
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
        <p
          className={`text-xl font-light mb-4 tracking-wide ${
            isDawn ? 'text-slate-800' : 'text-gray-200'
          }`}
        >
          <span className="bg-gradient-to-r from-purple-300 via-pink-300 to-cyan-300 bg-clip-text text-transparent">
            Your personal knowledge layer — searchable, semantic, supercharged.
          </span>
        </p>
        
        <p
          className={`text-base max-w-2xl mx-auto leading-relaxed ${
            isDawn ? 'text-slate-600' : 'text-gray-400'
          }`}
        >
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
            <div
              className={`relative flex items-center gap-2.5 px-5 py-2.5 rounded-full backdrop-blur-xl border-2 shadow-lg ${
                isDawn
                  ? 'bg-gradient-to-br from-green-400 to-emerald-400 border-emerald-300 shadow-emerald-300/50'
                  : 'bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-400/30 shadow-green-500/20'
              }`}
            >
              {/* Animated pulse dot */}
              <div className="relative flex items-center justify-center">
                <div
                  className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                    isDawn
                      ? 'bg-emerald-500 ring-2 ring-white/70 drop-shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                      : 'bg-green-400'
                  }`}
                ></div>
                <div
                  className={`absolute w-2.5 h-2.5 rounded-full animate-ping ${
                    isDawn
                      ? 'bg-emerald-500/80'
                      : 'bg-green-400'
                  }`}
                ></div>
              </div>
              {/* Server icon */}
              <svg
                className="w-4 h-4 text-emerald-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
              <span className="font-semibold tracking-wide text-emerald-50">
                Port 2789
              </span>
            </div>
          </div>

          <div className="relative group">
            <div
              className={`absolute -inset-0.5 rounded-full blur transition-all duration-500 ${
                isDawn
                  ? 'bg-gradient-to-r from-purple-300 via-pink-300 to-cyan-300 opacity-60 group-hover:opacity-80'
                  : 'bg-gradient-to-r from-slate-800 via-slate-900 to-black opacity-40 group-hover:opacity-70'
              }`}
            ></div>
            <button
              type="button"
              onClick={() => setTheme(isDawn ? 'dark' : 'dawn')}
              className={`relative flex items-center gap-2.5 px-5 py-2.5 rounded-full backdrop-blur-xl border-2 shadow-lg transition-all duration-300 hover:scale-105 ${
                isDawn
                  ? 'bg-white text-slate-800 border-slate-200 shadow-slate-300/70'
                  : 'bg-slate-900/80 text-gray-100 border-slate-700/80 shadow-purple-500/30'
              }`}
            >
              <div
                className={`relative w-10 h-5 rounded-full flex items-center px-1 transition-all duration-300 ${
                  isDawn
                    ? 'bg-gradient-to-r from-purple-300 via-pink-300 to-cyan-300'
                    : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-all duration-300 ${
                    isDawn ? 'translate-x-5' : 'translate-x-0'
                  }`}
                ></div>
              </div>
              <span className="text-xs font-semibold tracking-wide">
                {isDawn ? 'Dawn Mode' : 'Night Mode'}
              </span>
            </button>
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
                  ? isDawn
                    ? 'bg-gradient-to-br from-blue-500 to-cyan-500 border-blue-400 shadow-blue-400/50'
                    : 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-400/30 shadow-blue-500/20'
                  : isDawn
                    ? 'bg-gradient-to-br from-purple-500 to-pink-500 border-purple-400 shadow-purple-400/50'
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
              
              <span className="font-semibold tracking-wide text-white">
                {embeddingMode === "testing" ? "Testing Mode" : embeddingMode === "openai" ? "OpenAI Mode" : embeddingMode}
              </span>
            </button>
          </div>

          {/* Settings Button with Gradient Border */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 rounded-full blur opacity-40 group-hover:opacity-70 transition duration-300"></div>
            <button
              onClick={() => setShowSettings(true)}
              className={`relative flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-gradient-to-br backdrop-blur-xl border-2 shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 ${
                isDawn
                  ? 'from-purple-400 via-pink-400 to-cyan-400 border-purple-300 shadow-purple-300/60'
                  : 'from-purple-500/20 via-pink-500/20 to-cyan-500/20 border-purple-400/30 hover:border-purple-400/50 shadow-purple-500/20'
              }`}
            >
              {/* Rotating gear icon on hover */}
              <svg
                className="w-4 h-4 text-white group-hover:rotate-90 transition-transform duration-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="font-semibold tracking-wide text-white">
                Settings
              </span>
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
          <div
            className={`relative flex gap-3 bg-gradient-to-br from-white/[0.12] to-white/[0.08] backdrop-blur-3xl border-2 rounded-[2rem] p-3 shadow-2xl transition-all duration-300 ${
              searchFocused
                ? 'border-purple-400/50 shadow-purple-500/30 shadow-[0_0_40px_rgba(168,85,247,0.4)]'
                : 'border-white/20 hover:border-white/30'
            }`}
            style={{
              boxShadow: isDawn
                ? searchFocused
                  ? '0 18px 50px rgba(148,163,184,0.45)'
                  : '0 14px 40px rgba(148,163,184,0.35)'
                : searchFocused
                  ? '0 20px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.1), 0 0 40px rgba(168,85,247,0.4)'
                  : '0 20px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.1)'
            }}
          >
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
                className={`flex-1 bg-transparent outline-none text-lg font-light ${
                  isDawn
                    ? 'text-slate-800 placeholder:text-slate-600'
                    : 'text-white placeholder:text-gray-400'
                }`}
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

          {/* Floating Suggestions Dropdown - only before results are shown */}
          {showSuggestions && !loading && results.length === 0 && (
            <div
              className={`absolute top-full mt-3 left-0 right-0 backdrop-blur-2xl rounded-[1.5rem] shadow-2xl overflow-hidden animate-slide-up z-50 border ${
                isDawn
                  ? 'bg-white border-slate-200 shadow-slate-200/70'
                  : 'bg-gradient-to-br from-slate-900/95 to-slate-800/95 border-white/20 shadow-black/50'
              }`}
            >
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

        {/* Semantic Filter Pills - toggled by sidebar "Filters" */}
        {filtersOpen && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span
              className={`text-xs font-semibold uppercase tracking-wider ${
                isDawn ? 'text-slate-500' : 'text-gray-400'
              }`}
            >
              Filters:
            </span>
            {filterPills.map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => toggleFilter(pill.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  activeFilters.includes(pill.id)
                    ? isDawn
                      ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-lg shadow-purple-400/40 scale-105'
                      : 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-lg shadow-purple-500/30 scale-105'
                    : isDawn
                      ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:scale-105'
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
                className={`inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-medium transition-all duration-200 ${
                  isDawn
                    ? 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-200'
                    : 'bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30'
                }`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear all
              </button>
            )}
          </div>
        )}

      </div>

      {/* Error message */}
      {!isAnalyticsView && error && (
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

      {isAnalyticsView && analyticsError && (
        <div className="w-full max-w-3xl mb-6 z-10 animate-slide-up">
          <div className="bg-red-500/20 backdrop-blur-2xl border border-red-400/40 rounded-[1.5rem] p-5 flex items-center gap-3 shadow-xl shadow-red-500/10">
            <svg className="w-6 h-6 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01" />
            </svg>
            <p className="text-red-300">{analyticsError}</p>
          </div>
        </div>
      )}

      {isAnalyticsView && (
        <div className="w-full max-w-3xl space-y-5 z-10 pb-20 animate-slide-up">
          <div
            className={`glass-aurora-panel ${isDawn ? 'glass-aurora-panel-dawn' : 'glass-aurora-panel-dark'} p-6`}
          >
            <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/40">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 19h16M5 17V9m5 8V5m5 12v-6m5 6V7" />
                  </svg>
                </div>
                <div>
                  <p
                    className={`text-xs font-semibold tracking-wider uppercase ${
                      isDawn ? 'text-slate-600' : 'text-gray-400'
                    }`}
                  >
                    Usage overview
                  </p>
                  <p
                    className={`text-sm ${
                      isDawn ? 'text-slate-700' : 'text-gray-200'
                    }`}
                  >
                    Snapshot of your memories
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="inline-flex items-center gap-1 rounded-full bg-slate-900/70 border border-white/10 p-0.5 text-[11px]">
                  {[
                    { id: "all" as const, label: "All time" },
                    { id: "today" as const, label: "Today" },
                    { id: "week" as const, label: "This week" },
                    { id: "30d" as const, label: "30 days" },
                  ].map((range) => {
                    const active = analyticsRange === range.id;
                    return (
                      <button
                        key={range.id}
                        type="button"
                        onClick={() => setAnalyticsRange(range.id)}
                        className={`px-2.5 py-1 rounded-full transition-all duration-150 ${
                          active
                            ? "bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-sm shadow-purple-500/40"
                            : "text-gray-300 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {range.label}
                      </button>
                    );
                  })}
                </div>
                {analyticsStats.latestActivity && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/70 border border-white/10 text-xs text-gray-300">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Last activity {analyticsStats.latestActivity}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-[1.2rem] p-[1px] bg-gradient-to-r from-purple-500/60 via-pink-500/60 to-cyan-500/60">
                <div
                  className={`px-4 py-4 rounded-[1rem] border soft-shadow-panel ${
                    isDawn ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'
                  }`}
                >
                <p
                  className={`text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1.5 ${
                    isDawn ? 'text-slate-500' : 'text-gray-400'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M4 19h16" strokeWidth="2" strokeLinecap="round" />
                    <path d="M7 15l3-6 4 4 3-8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Total memories</span>
                </p>
                <p
                  className={`text-xl font-semibold ${
                    isDawn ? 'text-slate-700' : 'text-white'
                  }`}
                >
                  {analyticsStats.totalMemories.toLocaleString()}
                </p>
                <div className="mt-1">
                  <svg viewBox="0 0 100 24" className="w-full h-6 opacity-85" aria-hidden="true">
                    <defs>
                      <linearGradient id="spark-total" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#6366F1" />
                        <stop offset="50%" stopColor="#EC4899" />
                        <stop offset="100%" stopColor="#22D3EE" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 18 L20 16 L40 14 L60 10 L80 8 L100 6"
                      fill="none"
                      stroke="url(#spark-total)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M0 20 H100"
                      fill="none"
                      stroke={isDawn ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.25)'}
                      strokeWidth="1"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                </div>
              </div>
              <div className="rounded-[1.2rem] p-[1px] bg-gradient-to-r from-purple-500/60 via-pink-500/60 to-cyan-500/60">
                <div
                  className={`px-4 py-4 rounded-[1rem] border soft-shadow-panel ${
                    isDawn ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'
                  }`}
                >
                  <p
                    className={`text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1.5 ${
                      isDawn ? 'text-slate-500' : 'text-gray-400'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M12 5v14" strokeWidth="2" strokeLinecap="round" />
                      <path d="M5 12h14" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span>Added today</span>
                </p>
                <p
                  className={`text-xl font-semibold ${
                    isDawn ? 'text-purple-600' : 'text-purple-200'
                  }`}
                >
                  {analyticsStats.todayCount}
                </p>
                <div className="mt-1">
                  <svg viewBox="0 0 100 24" className="w-full h-6 opacity-85" aria-hidden="true">
                    <defs>
                      <linearGradient id="spark-today" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#A855F7" />
                        <stop offset="100%" stopColor="#EC4899" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 18 L20 14 L40 16 L60 9 L80 12 L100 7"
                      fill="none"
                      stroke="url(#spark-today)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M0 20 H100"
                      fill="none"
                      stroke={isDawn ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.25)'}
                      strokeWidth="1"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                </div>
              </div>
              <div className="rounded-[1.2rem] p-[1px] bg-gradient-to-r from-purple-500/60 via-pink-500/60 to-cyan-500/60">
                <div
                  className={`px-4 py-4 rounded-[1rem] border soft-shadow-panel ${
                    isDawn ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'
                  }`}
                >
                  <p
                    className={`text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1.5 ${
                      isDawn ? 'text-slate-500' : 'text-gray-400'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <rect x="3" y="4" width="18" height="17" rx="2" ry="2" strokeWidth="2" />
                      <path d="M3 10h18" strokeWidth="2" strokeLinecap="round" />
                      <path d="M8 3v4M16 3v4" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span>This week</span>
                  </p>
                  <p
                    className={`text-xl font-semibold ${
                      isDawn ? 'text-cyan-600' : 'text-cyan-200'
                    }`}
                  >
                    {analyticsStats.weekCount}
                  </p>
                  <div className="mt-1">
                    <svg viewBox="0 0 100 24" className="w-full h-6 opacity-85" aria-hidden="true">
                      <defs>
                        <linearGradient id="spark-week" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#22D3EE" />
                          <stop offset="100%" stopColor="#0EA5E9" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0 18 L20 15 L40 11 L60 13 L80 9 L100 5"
                        fill="none"
                        stroke="url(#spark-week)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M0 20 H100"
                        fill="none"
                        stroke={isDawn ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.25)'}
                        strokeWidth="1"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="rounded-[1.2rem] p-[1px] bg-gradient-to-r from-purple-500/60 via-pink-500/60 to-cyan-500/60">
                <div
                  className={`px-4 py-4 rounded-[1rem] border soft-shadow-panel ${
                    isDawn ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'
                  }`}
                >
                  <p
                    className={`text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1.5 ${
                      isDawn ? 'text-slate-500' : 'text-gray-400'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path
                        d="M12 4l2.4 4.86 5.36.78-3.88 3.69.92 5.34L12 16.98 7.2 18.67l.92-5.34L4.24 9.64l5.36-.78L12 4z"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>Pinned</span>
                  </p>
                  <p
                    className={`text-xl font-semibold ${
                      isDawn ? 'text-pink-600' : 'text-pink-200'
                    }`}
                  >
                    {analyticsStats.pinnedCount}
                  </p>
                  <div className="mt-1">
                    <svg viewBox="0 0 100 24" className="w-full h-6 opacity-85" aria-hidden="true">
                      <defs>
                        <linearGradient id="spark-pinned" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#fb7185" />
                          <stop offset="100%" stopColor="#f472b6" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0 18 L20 12 L40 18 L60 10 L80 14 L100 8"
                        fill="none"
                        stroke="url(#spark-pinned)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M0 20 H100"
                        fill="none"
                        stroke={isDawn ? 'rgba(236, 72, 153, 0.25)' : 'rgba(248, 113, 113, 0.25)'}
                        strokeWidth="1"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              className={`glass-aurora-panel ${isDawn ? 'glass-aurora-panel-dawn' : 'glass-aurora-panel-dark'} p-6`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-purple-500/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h10M4 14h6" />
                    </svg>
                  </span>
                  <p
                    className={`text-sm font-semibold ${
                      isDawn ? 'text-slate-900' : 'text-white'
                    }`}
                  >
                    Sources
                  </p>
                </div>
              </div>
              {analyticsStats.sourceCounts.length === 0 ? (
                <p
                  className={`text-sm ${
                    isDawn ? 'text-slate-600' : 'text-gray-400'
                  }`}
                >
                  No source data yet. Add memories from your tools to see a breakdown here.
                </p>
              ) : (
                <div className="space-y-2">
                  {analyticsStats.sourceCounts.map((item) => (
                    <div key={item.source} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-400" />
                        <span
                          className={`capitalize ${
                            isDawn ? 'text-slate-700' : 'text-gray-200'
                          }`}
                        >
                          {item.source}
                        </span>
                      </div>
                      <span
                        className={`${
                          isDawn ? 'text-slate-600' : 'text-gray-300'
                        }`}
                      >
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              className={`glass-aurora-panel ${isDawn ? 'glass-aurora-panel-dawn' : 'glass-aurora-panel-dark'} p-6`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-cyan-500/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </span>
                  <p
                    className={`text-sm font-semibold ${
                      isDawn ? 'text-slate-900' : 'text-white'
                    }`}
                  >
                    Top tags
                  </p>
                </div>
              </div>
              {analyticsStats.tagCounts.length === 0 ? (
                <p
                  className={`text-sm ${
                    isDawn ? 'text-slate-600' : 'text-gray-400'
                  }`}
                >
                  No tags detected yet. Add tags in your source tools to see them here.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {analyticsStats.tagCounts.map((item) => (
                    <motion.div
                      key={item.tag}
                      className={`px-3 py-1.5 rounded-full text-xs ${
                        isDawn
                          ? 'bg-purple-50 border border-purple-200 text-purple-700'
                          : 'bg-purple-500/20 border border-purple-500/40 text-purple-100'
                      }`}
                      whileHover={{ scale: 1.04, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 20, mass: 0.4 }}
                      layout
                    >
                      <span className="mr-2">#{item.tag}</span>
                      <span
                        className={`${
                          isDawn ? 'text-purple-500/80' : 'text-purple-300/80'
                        }`}
                      >
                        {item.count}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div
            className={`glass-aurora-panel ${isDawn ? 'glass-aurora-panel-dawn' : 'glass-aurora-panel-dark'} p-6`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-pink-500/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-pink-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4h16v4H4zM4 12h8v8H4zM16 12h4v8h-4z" />
                  </svg>
                </span>
                <p
                  className={`text-sm font-semibold ${
                    isDawn ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  Search and curation
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                className={`px-3 py-2 rounded-xl border ${
                  isDawn ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'
                }`}
              >
                <p
                  className={`text-[11px] uppercase tracking-wider mb-1 ${
                    isDawn ? 'text-slate-500' : 'text-gray-400'
                  }`}
                >
                  Recent searches
                </p>
                <p
                  className={`text-lg font-semibold ${
                    isDawn ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {analyticsStats.recentSearchCount}
                </p>
              </div>
              <div
                className={`px-3 py-2 rounded-xl border ${
                  isDawn ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'
                }`}
              >
                <p
                  className={`text-[11px] uppercase tracking-wider mb-1 ${
                    isDawn ? 'text-slate-500' : 'text-gray-400'
                  }`}
                >
                  Indexed memories
                </p>
                <p
                  className={`text-lg font-semibold ${
                    isDawn ? 'text-slate-900' : 'text-gray-100'
                  }`}
                >
                  {analyticsMemories.length}
                </p>
              </div>
              <div
                className={`px-3 py-2 rounded-xl border flex items-center justify-between soft-shadow-panel ${
                  isDawn ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'
                }`}
              >
                <div>
                  <p
                    className={`text-[11px] uppercase tracking-wider mb-1 ${
                      isDawn ? 'text-slate-500' : 'text-gray-400'
                    }`}
                  >
                    Pinned coverage
                  </p>
                  <p
                    className={`text-lg font-semibold ${
                      isDawn ? 'text-pink-600' : 'text-pink-100'
                    }`}
                  >
                    {analyticsStats.totalMemories > 0
                      ? `${Math.round((analyticsStats.pinnedCount / analyticsStats.totalMemories) * 100)}%`
                      : '0%'}
                  </p>
                </div>
              </div>
            </div>

            {analyticsLoading && analyticsMemories.length === 0 && (
              <div
                className={`mt-4 flex items-center gap-2 text-xs ${
                  isDawn ? 'text-slate-600' : 'text-gray-400'
                }`}
              >
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Calculating analytics from your indexed memories</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enhanced Memory Cards with Depth & Elevation */}
      {!isAnalyticsView && (
        <AnimatePresence mode="wait">
          <motion.div
            key={isCollectionsView ? 'collections' : 'results'}
            variants={listVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="w-full max-w-3xl space-y-5 z-10 pb-20"
          >
        {displayResults.map((r, index) => {
          const keywords = extractKeywords(r.content);
          const isHovered = hoveredCardId === r.id;
          const isPinned = Boolean(pinnedMap[r.id]);
          
          return (
          <motion.div
            key={r.id}
            className="group"
            variants={cardVariants}
            layout="position"
            transition={{ layout: { duration: 0.18, ease: "easeOut" } }}
            onMouseEnter={() => setHoveredCardId(r.id)}
            onMouseLeave={() => setHoveredCardId(null)}
          >
            <div className="relative">
              {/* Gradient border glow - Apple Vision Pro style */}
              <div
                className={`absolute -inset-[1px] bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 rounded-[1.75rem] transition-all duration-500 ${
                  isDawn
                    ? (isHovered ? 'opacity-40 blur-md' : 'opacity-20 blur-lg')
                    : (isHovered ? 'opacity-28 blur-md' : 'opacity-10 blur-lg')
                }`}
              ></div>
              
              {/* Main card with depth hierarchy */}
              <div
                className={`relative ${
                  isDawn 
                    ? 'glass-result-card-dawn' 
                    : 'glass-result-card-dark'
                } p-6 transition-all duration-300 overflow-hidden ${
                  isHovered
                    ? isDawn
                      ? 'translate-y-[-4px]'
                      : 'translate-y-[-2px]'
                    : ''
                } ${
                  isHovered
                    ? isDawn
                      ? 'neon-border-card-dawn'
                      : 'neon-border-card'
                    : ''
                }`}
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
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium backdrop-blur-xl capitalize ${
                            isDawn
                              ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          }`}
                        >
                          {r.metadata.source_app}
                        </span>
                      )}
                      
                      {/* Timestamp */}
                      {r.metadata?.timestamp && (
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium backdrop-blur-xl ${
                            isDawn
                              ? 'bg-slate-100 text-slate-600 border border-slate-200'
                              : 'bg-slate-500/20 text-gray-300 border border-slate-500/30'
                          }`}
                        >
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
                      <div
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full backdrop-blur-xl ${
                          isDawn
                            ? 'bg-amber-50 border border-amber-200'
                            : 'bg-yellow-500/20 border border-yellow-500/30'
                        }`}
                      >
                        <svg
                          className={`w-3 h-3 ${
                            isDawn ? 'text-amber-500' : 'text-yellow-400'
                          }`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span
                          className={`text-xs font-semibold ${
                            isDawn ? 'text-amber-700' : 'text-yellow-300'
                          }`}
                        >
                          {r.score.toFixed(2)}
                        </span>
                      </div>
                      
                      {/* ID (smaller, less prominent) */}
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-mono border ${
                          isDawn
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                        }`}
                      >
                        {r.id.slice(0, 8)}
                      </span>
                    </div>
                    {/* Content with expand/collapse */}
                    <div 
                      onClick={() => toggleExpand(r.id)}
                      className="cursor-pointer group/content"
                    >
                      <p
                        className={`leading-relaxed text-[15px] transition-all duration-300 ${
                          isDawn ? 'text-slate-800' : 'text-gray-200'
                        } ${
                          expandedIds.has(r.id) ? '' : 'line-clamp-3'
                        }`}
                      >
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
                          isDawn
                            ? isHovered
                              ? 'bg-purple-200 border-2 border-purple-300 text-purple-800 shadow-lg shadow-purple-300/60 scale-105'
                              : 'bg-purple-100 border border-purple-200 text-purple-700'
                            : isHovered
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
                          isDawn
                            ? isHovered
                              ? 'bg-cyan-200 border-2 border-cyan-300 text-cyan-800 shadow-lg shadow-cyan-300/60 scale-105'
                              : 'bg-cyan-100 border border-cyan-200 text-cyan-700'
                            : isHovered
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
                            : isDawn
                              ? isHovered
                                ? 'bg-pink-200 border-2 border-pink-300 text-pink-800 shadow-lg shadow-pink-300/60 scale-105'
                                : 'bg-pink-100 border border-pink-200 text-pink-700'
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
                      <div
                        className={`relative p-4 backdrop-blur-xl border rounded-xl overflow-hidden ${
                          isDawn
                            ? 'bg-gradient-to-br from-white/95 via-purple-50/70 to-cyan-50/70 border-white/80 shadow-[0_25px_60px_rgba(168,85,247,0.18)]'
                            : 'bg-gradient-to-br from-slate-900/90 to-slate-800/90 border-white/20'
                        }`}
                      >
                        {isDawn && (
                          <div className="absolute inset-0 pointer-events-none">
                            <div className="absolute inset-y-2 inset-x-4 rounded-[1.25rem] bg-gradient-to-r from-white/60 via-transparent to-white/30 blur-xl opacity-60"></div>
                            <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-transparent opacity-70"></div>
                          </div>
                        )}
                        <div className="space-y-3 text-sm relative z-10">
                          {/* Summary */}
                          <div>
                            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Summary
                            </div>
                            <p
                              className={`text-sm line-clamp-2 ${
                                isDawn ? 'text-slate-600' : 'text-gray-300'
                              }`}
                            >
                              {r.content.slice(0, 120)}...
                            </p>
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
                                  <span
                                    key={idx}
                                    className={`px-2 py-1 text-xs rounded-lg border ${
                                      isDawn
                                        ? 'bg-purple-100 text-purple-800 border-purple-200'
                                        : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                    }`}
                                  >
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Tags & Source */}
                          <div className="flex items-center gap-3 pt-2 border-t border-white/10">
                            <div className="flex items-center gap-1.5">
                              <svg
                                className={`w-3 h-3 ${
                                  isDawn ? 'text-cyan-500' : 'text-cyan-400'
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                              </svg>
                              <span
                                className={`text-xs ${
                                  isDawn ? 'text-slate-500' : 'text-gray-400'
                                }`}
                              >
                                Source:
                              </span>
                              <span
                                className={`text-xs font-medium capitalize ${
                                  isDawn ? 'text-cyan-700' : 'text-cyan-300'
                                }`}
                              >
                                {r.metadata?.source_app || 'Unknown'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <svg
                                className={`w-3 h-3 ${
                                  isDawn ? 'text-amber-500' : 'text-yellow-400'
                                }`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              <span
                                className={`text-xs ${
                                  isDawn ? 'text-slate-500' : 'text-gray-400'
                                }`}
                              >
                                Score:
                              </span>
                              <span
                                className={`text-xs font-medium ${
                                  isDawn ? 'text-amber-700' : 'text-yellow-300'
                                }`}
                              >
                                {r.score.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
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
        </motion.div>
      </AnimatePresence>
    )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-fade-in">
          <div
            className={`relative w-full max-w-md glass-aurora-panel ${
              isDawn ? 'glass-aurora-panel-dawn' : 'glass-aurora-panel-dark'
            } rounded-[2rem] shadow-2xl animate-slide-up`}
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-start justify-between gap-3">
              <div>
                <h2
                  className={`text-2xl font-bold flex items-center gap-2 ${
                    isDawn ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Embedding Configuration
                </h2>
                <p
                  className={`text-sm mt-1 ${
                    isDawn ? 'text-slate-600' : 'text-gray-400'
                  }`}
                >
                  Choose your embedding mode
                </p>
              </div>
              {/* Close button */}
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 rounded-[0.75rem] hover:bg-white/10 transition-colors flex-shrink-0"
                type="button"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Current Mode */}
              <div
                className={`p-4 rounded-[1rem] border backdrop-blur-xl ${
                  isDawn ? 'bg-white/90 border-slate-200' : 'bg-white/5 border-white/10'
                }`}
              >
                <p
                  className={`text-sm mb-1 ${
                    isDawn ? 'text-slate-600' : 'text-gray-400'
                  }`}
                >
                  Current Mode
                </p>
                <p
                  className={`text-lg font-semibold capitalize ${
                    isDawn ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {embeddingMode}
                </p>
              </div>

              {/* Mode Selection */}
              <div className="space-y-3">
                <label
                  className={`text-sm font-medium ${
                    isDawn ? 'text-slate-700' : 'text-gray-300'
                  }`}
                >
                  Select Mode
                </label>

                {/* Testing Mode */}
                <button
                  onClick={() => handleModeSwitch("testing")}
                  disabled={configLoading || embeddingMode === "testing"}
                  className={`w-full p-4 rounded-[1.25rem] border-2 transition-all text-left backdrop-blur-xl ${
                    embeddingMode === "testing"
                      ? (isDawn
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-blue-500 bg-blue-500/20')
                      : (isDawn
                          ? 'border-slate-200 bg-white hover:border-blue-400'
                          : 'border-white/20 hover:border-blue-500/50 bg-white/5')
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <div className="flex-1">
                      <h3
                        className={`font-semibold mb-1 ${
                          isDawn ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        Testing Mode
                      </h3>
                      <p
                        className={`text-sm ${
                          isDawn ? 'text-slate-600' : 'text-gray-400'
                        }`}
                      >
                        Hash-based embeddings • Free • No API key required
                      </p>
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
                        ? (isDawn
                            ? 'border-green-500 bg-emerald-50'
                            : 'border-green-500 bg-green-500/20')
                        : (isDawn
                            ? 'border-slate-200 bg-white hover:border-green-400'
                            : 'border-white/20 hover:border-green-500/50 bg-white/5')
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      <div className="flex-1">
                        <h3
                          className={`font-semibold mb-1 ${
                            isDawn ? 'text-slate-900' : 'text-white'
                          }`}
                        >
                          OpenAI Mode
                        </h3>
                        <p
                          className={`text-sm ${
                            isDawn ? 'text-slate-600' : 'text-gray-400'
                          }`}
                        >
                          True semantic search • Requires API key
                        </p>
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
                    <label
                      className={`block text-sm font-medium mb-2 ${
                        isDawn ? 'text-slate-700' : 'text-gray-300'
                      }`}
                    >
                      OpenAI API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-proj-xxxxxxxxxxxxxxxxxxxxx"
                      className={`w-full px-4 py-3 rounded-[0.75rem] transition-all backdrop-blur-xl focus:outline-none focus:border-purple-500 ${
                        isDawn
                          ? 'bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white'
                          : 'bg-white/5 border border-white/20 text-white placeholder:text-gray-400 focus:bg-white/10'
                      }`}
                    />
                    <p
                      className={`text-xs mt-1 ${
                        isDawn ? 'text-slate-500' : 'text-gray-500'
                      }`}
                    >
                      Get your API key from{" "}
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={isDawn ? 'text-purple-500 hover:underline' : 'text-purple-400 hover:underline'}
                      >
                        platform.openai.com
                      </a>
                    </p>
                  </div>
                </div>
              </div>

              {/* Status Message */}
              {configMessage && (
                <div
                  className={`p-4 rounded-[1rem] border backdrop-blur-xl ${
                    configMessage.type === "success"
                      ? "bg-green-500/20 border-green-500/50 text-green-300"
                      : "bg-red-500/20 border-red-500/50 text-red-300"
                  } animate-slide-up`}
                >
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
        @keyframes gridNodePulse {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.5);
          }
        }
        @keyframes particleDrift {
          0% {
            transform: translate(0, 0);
          }
          25% {
            transform: translate(15px, -10px);
          }
          50% {
            transform: translate(25px, 5px);
          }
          75% {
            transform: translate(10px, 15px);
          }
          100% {
            transform: translate(0, 0);
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

        /* Nebula background motion */
        @keyframes nebula-slow {
          0% {
            transform: translate3d(-6%, -4%, 0) scale(1.05);
          }
          50% {
            transform: translate3d(4%, 4%, 0) scale(1.12);
          }
          100% {
            transform: translate3d(-4%, 2%, 0) scale(1.05);
          }
        }
        @keyframes nebula-medium {
          0% {
            transform: translate3d(4%, -6%, 0) scale(1);
          }
          50% {
            transform: translate3d(-4%, 2%, 0) scale(1.08);
          }
          100% {
            transform: translate3d(4%, -4%, 0) scale(1);
          }
        }
        @keyframes nebula-fast {
          0% {
            transform: translate3d(-2%, 4%, 0) scale(1.02);
          }
          50% {
            transform: translate3d(2%, -2%, 0) scale(1.1);
          }
          100% {
            transform: translate3d(-2%, 4%, 0) scale(1.02);
          }
        }

        /* Soft background wave motion - animate gradient, not the box, to avoid visible edges */
        @keyframes wave-slow {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        @keyframes wave-medium {
          0% {
            background-position: 100% 50%;
          }
          50% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 100% 50%;
          }
        }

        .animate-nebula-slow {
          animation: nebula-slow 42s ease-in-out infinite alternate;
        }
        .animate-nebula-medium {
          animation: nebula-medium 32s ease-in-out infinite alternate;
        }
        .animate-nebula-fast {
          animation: nebula-fast 26s ease-in-out infinite alternate;
        }

        .animate-wave-slow {
          animation: wave-slow 40s ease-in-out infinite alternate;
          background-size: 200% 200%;
        }
        .animate-wave-medium {
          animation: wave-medium 30s ease-in-out infinite alternate;
          background-size: 220% 220%;
        }

        /* Neon conic-gradient border for action buttons */
        .neon-border-button {
          position: relative;
          z-index: 0;
          box-sizing: border-box;
        }
        .neon-border-button::after {
          --nb-border-radius: 0.75rem;
          --nb-border-width: 2px;
          content: "";
          position: absolute;
          inset: 0;
          padding: var(--nb-border-width);
          border-radius: var(--nb-border-radius);
          background-image: conic-gradient(
            #488cfb,
            #29dbbc,
            #ddf505,
            #ff9f0e,
            #e440bb,
            #655adc,
            #488cfb
          );
          -webkit-mask-image: linear-gradient(#000, #000), linear-gradient(#000, #000);
          mask-image: linear-gradient(#000, #000), linear-gradient(#000, #000);
          -webkit-mask-origin: content-box, padding-box;
          mask-origin: content-box, padding-box;
          -webkit-mask-clip: content-box, padding-box;
          mask-composite: exclude;
          -webkit-mask-composite: destination-out;
          filter: hue-rotate(0deg);
          animation: neon-rotate-hue 500ms linear infinite;
          animation-play-state: paused;
          pointer-events: none;
          box-sizing: border-box;
        }
        .neon-border-button:hover::after {
          animation-play-state: running;
        }
        .neon-border-button:active::after {
          --nb-border-width: 3px;
        }
        @keyframes neon-rotate-hue {
          to {
            filter: hue-rotate(1turn);
          }
        }

        .neon-border-card {
          position: relative;
          z-index: 0;
          box-sizing: border-box;
        }
        .neon-border-card::after {
          --nc-border-radius: 1.5rem;
          --nc-border-width: 2px;
          --nc-glow-offset: 8px;
          content: "";
          position: absolute;
          inset: calc(-1 * var(--nc-glow-offset));
          padding: calc(var(--nc-border-width) + var(--nc-glow-offset));
          border-radius: calc(var(--nc-border-radius) + var(--nc-glow-offset));
          background-image: conic-gradient(
            #488cfb,
            #29dbbc,
            #ddf505,
            #ff9f0e,
            #e440bb,
            #655adc,
            #488cfb
          );
          -webkit-mask-image: linear-gradient(#000, #000), linear-gradient(#000, #000);
          mask-image: linear-gradient(#000, #000), linear-gradient(#000, #000);
          -webkit-mask-origin: content-box, padding-box;
          mask-origin: content-box, padding-box;
          -webkit-mask-clip: content-box, padding-box;
          mask-composite: exclude;
          -webkit-mask-composite: destination-out;
          filter: hue-rotate(0deg) drop-shadow(0 0 18px rgba(72, 140, 251, 0.45)) drop-shadow(0 0 32px rgba(41, 219, 188, 0.35));
          animation: neon-rotate-hue 900ms linear infinite;
          animation-play-state: paused;
          opacity: 0;
          pointer-events: none;
          box-sizing: border-box;
        }
        .neon-border-card:hover::after {
          opacity: 1;
          animation-play-state: running;
        }

        .neon-border-card-dawn {
          position: relative;
          z-index: 0;
          box-sizing: border-box;
        }
        .neon-border-card-dawn::after {
          --ncd-border-radius: 1.5rem;
          --ncd-border-width: 3px;
          --ncd-glow-offset: 8px;
          content: "";
          position: absolute;
          inset: calc(-1 * var(--ncd-glow-offset));
          padding: calc(var(--ncd-border-width) + var(--ncd-glow-offset));
          border-radius: calc(var(--ncd-border-radius) + var(--ncd-glow-offset));
          background-image: conic-gradient(
            rgb(168, 85, 247),
            rgb(244, 114, 182),
            rgb(96, 165, 250),
            rgb(45, 212, 191),
            rgb(251, 113, 133),
            rgb(129, 140, 248),
            rgb(168, 85, 247)
          );
          -webkit-mask-image: linear-gradient(#000, #000), linear-gradient(#000, #000);
          mask-image: linear-gradient(#000, #000), linear-gradient(#000, #000);
          -webkit-mask-origin: content-box, padding-box;
          mask-origin: content-box, padding-box;
          -webkit-mask-clip: content-box, padding-box;
          mask-composite: exclude;
          -webkit-mask-composite: destination-out;
          filter: hue-rotate(0deg) drop-shadow(0 0 22px rgba(244, 114, 182, 0.4)) drop-shadow(0 0 30px rgba(56, 189, 248, 0.35));
          box-shadow: 0 0 18px rgba(168, 85, 247, 0.35);
          animation: neon-rotate-hue 1400ms linear infinite;
          animation-play-state: paused;
          opacity: 0;
          pointer-events: none;
          box-sizing: border-box;
        }
        .neon-border-card-dawn:hover::after {
          opacity: 1;
          animation-play-state: running;
        }
      `}</style>
    </motion.main>
  );
}
