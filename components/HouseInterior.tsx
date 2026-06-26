"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import type { Stargazer } from "@/lib/stargazers";
import { nameForIndex } from "@/lib/names";
import { tierForIndex, TIER_COLOR } from "@/lib/rarity";
import { CloseIcon, StarIcon } from "./Icons";

type Repo = {
  name: string;
  owner: string;
  description: string | null;
  stars: number;
  lang: string | null;
  langColor: string;
  url: string;
  pushedAt: string | null;
  fork: boolean;
};

type GhUser = {
  login: string;
  name: string;
  bio: string | null;
  avatarUrl: string;
  followers: number;
  following: number;
  location: string | null;
  company: string | null;
  blog: string | null;
  twitter: string | null;
  publicRepos: number;
  htmlUrl: string;
  pinned: Repo[];
  pinnedIsFallback: boolean;
  repos: Repo[];
  readmeHtml: string | null;
};

const nf = (n: number) => new Intl.NumberFormat("en-US").format(n);

// Turn @mentions in a bio into clickable GitHub profile links.
function LinkifyBio({ text }: { text: string }) {
  const parts = text.split(/(@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <a
            key={i}
            href={`https://github.com/${p.slice(1)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#4493f8] hover:underline"
          >
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

// Pin / location / link glyphs to match GitHub's sidebar.
const PinIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
    <path d="M11.536 0a2 2 0 0 0-1.426.6L4.45 6.327A4 4 0 0 0 1.214 7.49l-.66.66a1.5 1.5 0 0 0 0 2.12l1.83 1.83-2.06 2.06a.75.75 0 1 0 1.06 1.06l2.06-2.06 1.83 1.83a1.5 1.5 0 0 0 2.12 0l.66-.66a4 4 0 0 0 1.163-3.236l5.728-5.66A2 2 0 0 0 16 4.34V1a1 1 0 0 0-1-1h-3.464Z" />
  </svg>
);
const LocationIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
    <path d="M8 0a5.53 5.53 0 0 0-5.5 5.5c0 2.29 1.5 4.6 5 8.2a.7.7 0 0 0 1 0c3.5-3.6 5-5.91 5-8.2A5.53 5.53 0 0 0 8 0Zm0 7.75A2.25 2.25 0 1 1 8 3.25a2.25 2.25 0 0 1 0 4.5Z" />
  </svg>
);
const LinkIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
    <path d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z" />
  </svg>
);
const RepoIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
    <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z" />
  </svg>
);

function RepoCard({ repo }: { repo: Repo }) {
  return (
    <a
      href={repo.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-1.5 rounded-md border border-[#3d444d] bg-transparent p-4 transition hover:border-[#656c76]"
    >
      <div className="flex items-center gap-2">
        <RepoIcon className="h-4 w-4 shrink-0 text-[#9198a1]" />
        <span className="truncate text-sm font-semibold text-[#4493f8] hover:underline">
          {repo.name}
        </span>
      </div>
      {repo.description && (
        <p className="line-clamp-2 text-xs leading-relaxed text-[#9198a1]">
          {repo.description}
        </p>
      )}
      <div className="mt-auto flex items-center gap-4 pt-1 text-[12px] text-[#9198a1]">
        {repo.lang && (
          <span className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: repo.langColor }}
            />
            {repo.lang}
          </span>
        )}
        {repo.stars > 0 && (
          <span className="flex items-center gap-1">
            <StarIcon className="h-3.5 w-3.5" />
            {nf(repo.stars)}
          </span>
        )}
      </div>
    </a>
  );
}

export default function HouseInterior({
  index,
  stargazer,
  onClose,
}: {
  index: number;
  stargazer?: Stargazer | null;
  onClose: () => void;
}) {
  const tier = stargazer?.tier ?? tierForIndex(index);
  const fallbackLogin = stargazer?.login ?? nameForIndex(index);
  const profileUrl = stargazer?.profileUrl ?? `https://github.com/${fallbackLogin}`;

  const [user, setUser] = useState<GhUser | null>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [tab, setTab] = useState<"overview" | "repositories">("overview");
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;
    const items = panel.querySelectorAll("[data-profile-item]");
    const tl = gsap.timeline();
    tl.fromTo(
      overlay,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.22, ease: "power2.out" },
    )
      .fromTo(
        panel,
        { autoAlpha: 0, y: 18, scale: 0.965, filter: "blur(14px)" },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.36,
          ease: "back.out(1.35)",
        },
        0.02,
      )
      .fromTo(
        items,
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.26, stagger: 0.03, ease: "power2.out" },
        "-=0.18",
      );
  }, []);

  useEffect(() => {
    const login = stargazer?.login;
    if (!login) {
      setState("error");
      return;
    }
    let alive = true;
    setState("loading");
    setUser(null);
    setTab("overview");
    fetch(`/api/gh-user?login=${encodeURIComponent(login)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        if (d.error) return setState("error");
        setUser(d);
        setState("done");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [stargazer?.login]);

  const displayName = user?.name ?? fallbackLogin;
  const login = user?.login ?? fallbackLogin;
  const avatar = user?.avatarUrl ?? stargazer?.avatarUrl;

  const sortedRepos = useMemo(
    () =>
      [...(user?.repos ?? [])].sort(
        (a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""),
      ),
    [user?.repos],
  );

  const websiteHref = user?.blog
    ? user.blog.startsWith("http")
      ? user.blog
      : `https://${user.blog}`
    : null;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-20 grid place-items-center bg-black/55 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="relative flex h-[80vh] max-h-[680px] w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border border-[#3d444d] bg-[#0d1117] opacity-0 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg border border-[#3d444d] bg-[#0d1117]/80 text-[#9198a1] transition hover:bg-[#21262d] hover:text-white"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[296px_1fr]">
          {/* Sidebar — profile identity */}
          <aside data-profile-item className="flex flex-col gap-3 overflow-y-auto border-b border-[#21262d] p-6 md:border-b-0 md:border-r">
            <div className="flex items-end gap-4 md:block">
              {avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt={login}
                  className="h-20 w-20 shrink-0 rounded-full border border-[#3d444d] md:h-[260px] md:w-[260px] md:max-w-full"
                />
              )}
              <div className="min-w-0 md:mt-4">
                <span
                  className="mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: TIER_COLOR[tier] + "26", color: TIER_COLOR[tier] }}
                >
                  {tier}
                </span>
                <h2 className="truncate text-xl font-semibold leading-tight text-[#f0f6fc]">
                  {displayName}
                </h2>
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-lg font-light text-[#9198a1] hover:text-[#4493f8]"
                >
                  {login}
                </a>
              </div>
            </div>

            {user?.bio && (
              <p className="text-sm leading-relaxed text-[#e6edf3]">
                <LinkifyBio text={user.bio} />
              </p>
            )}

            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-[#3d444d] bg-[#21262d] py-1.5 text-center text-sm font-medium text-[#e6edf3] transition hover:bg-[#30363d]"
            >
              View GitHub profile
            </a>

            {state === "done" && user && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#9198a1]">
                <span className="flex items-center gap-1">
                  <span className="font-semibold text-[#e6edf3]">{nf(user.followers)}</span>
                  followers
                </span>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-1">
                  <span className="font-semibold text-[#e6edf3]">{nf(user.following)}</span>
                  following
                </span>
              </div>
            )}

            {state === "done" && user && (
              <div className="flex flex-col gap-1.5 text-[13px] text-[#9198a1]">
                {user.location && (
                  <span className="flex items-center gap-2">
                    <LocationIcon className="h-4 w-4 shrink-0 text-[#9198a1]" />
                    {user.location}
                  </span>
                )}
                {websiteHref && (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-[#4493f8]"
                  >
                    <LinkIcon className="h-4 w-4 shrink-0 text-[#9198a1]" />
                    <span className="truncate">{user.blog}</span>
                  </a>
                )}
              </div>
            )}

            {state === "loading" && (
              <div className="space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-[#21262d]" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-[#21262d]" />
              </div>
            )}
            {state === "error" && (
              <p className="text-[13px] text-[#9198a1]">
                No public GitHub data for this house yet.
              </p>
            )}
          </aside>

          {/* Main — tabs + content */}
          <main data-profile-item className="flex min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-1 border-b border-[#21262d] px-4 pt-4">
              {(["overview", "repositories"] as const).map((t) => {
                const active = tab === t;
                const count = t === "repositories" ? user?.repos.length : undefined;
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`relative flex items-center gap-2 rounded-t-md px-3 pb-3 text-sm transition ${
                      active ? "font-semibold text-[#f0f6fc]" : "text-[#9198a1] hover:text-[#e6edf3]"
                    }`}
                  >
                    <span className="capitalize">{t}</span>
                    {count != null && (
                      <span className="rounded-full bg-[#30363d] px-1.5 text-[11px] tabular-nums text-[#e6edf3]">
                        {count}
                      </span>
                    )}
                    {active && (
                      <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-[#f78166]" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {state === "loading" && (
                <div className="space-y-3">
                  {[0, 1, 2].map((k) => (
                    <div
                      key={k}
                      className="h-20 animate-pulse rounded-md border border-[#21262d] bg-[#161b22]"
                    />
                  ))}
                </div>
              )}

              {state === "error" && (
                <p className="text-sm text-[#9198a1]">No public GitHub data for this house yet.</p>
              )}

              {state === "done" && user && tab === "overview" && (
                <div className="space-y-6">
                  {user.readmeHtml && (
                    <div className="overflow-hidden rounded-md border border-[#3d444d]">
                      <div className="border-b border-[#21262d] bg-[#161b22] px-4 py-2 text-xs text-[#9198a1]">
                        <span className="text-[#e6edf3]">{login}</span>/README.md
                      </div>
                      <div
                        className="markdown-body p-6"
                        dangerouslySetInnerHTML={{ __html: user.readmeHtml }}
                      />
                    </div>
                  )}

                  {user.pinned.length > 0 && (
                    <section>
                      <h3 className="mb-3 text-sm font-medium text-[#e6edf3]">
                        {user.pinnedIsFallback ? "Popular repositories" : "Pinned"}
                      </h3>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {user.pinned.map((r) => (
                          <RepoCard key={r.url} repo={r} />
                        ))}
                      </div>
                    </section>
                  )}

                  {!user.readmeHtml && user.pinned.length === 0 && (
                    <p className="text-sm text-[#9198a1]">Nothing to show here yet.</p>
                  )}
                </div>
              )}

              {state === "done" && user && tab === "repositories" && (
                <div className="space-y-3">
                  {sortedRepos.length === 0 && (
                    <p className="text-sm text-[#9198a1]">No public repositories.</p>
                  )}
                  {sortedRepos.map((r) => (
                    <RepoCard key={r.url} repo={r} />
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
