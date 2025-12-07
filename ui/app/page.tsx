"use client";

import { useState } from "react";

type MemoryResult = {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemoryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        query: query || "test",
        limit: "5",
      });

      const res = await fetch(
        `http://127.0.0.1:2789/recall?${params.toString()}`
      );

      if (!res.ok) {
        throw new Error(`Daemon error: ${res.status}`);
      }

      const data = await res.json();
      setResults(data.results ?? []);
    } catch (err: any) {
      setError(err.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center p-8">
      <h1 className="text-3xl font-bold mb-4">Context Memory Mesh</h1>
      <p className="mb-6 text-gray-300">
        Search your local memories powered by the daemon on port 2789.
      </p>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6 w-full max-w-xl">
        <input
          className="flex-1 px-3 py-2 rounded bg-gray-900 border border-gray-700"
          placeholder="Search memories (e.g. vector databases)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600"
          disabled={loading}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      <div className="w-full max-w-xl space-y-3">
        {results.map((r) => (
          <div
            key={r.id}
            className="border border-gray-700 rounded p-3 bg-gray-900"
          >
            <div className="text-sm text-gray-400 mb-1">
              {r.id} · score {r.score.toFixed(2)}
            </div>
            <div>{r.content}</div>
          </div>
        ))}

        {!loading && !error && results.length === 0 && (
          <p className="text-gray-500">
            No results yet. Try a search; the daemon will return an empty list
            until you implement real recall.
          </p>
        )}
      </div>
    </main>
  );
}
