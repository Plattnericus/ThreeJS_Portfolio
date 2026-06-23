"use client";

// Search your house by name. Matching is done in the page (shared name list);
// this is just the input + a small result hint.
export default function SearchBar({
  query,
  onQuery,
  match,
}: {
  query: string;
  onQuery: (q: string) => void;
  match: string | null;
}) {
  return (
    <div className="absolute left-1/2 top-5 -translate-x-1/2">
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search your house by name…"
        className="w-64 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder-white/40 outline-none backdrop-blur-sm focus:border-canopy"
      />
      {query && (
        <div className="mt-1 text-center text-[11px] text-white/60">
          {match ? `Found: ${match}` : "No house with that name"}
        </div>
      )}
    </div>
  );
}
