"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Stargazer } from "@/lib/stargazers";
import { nameForIndex } from "@/lib/names";
import { tierForIndex, TIER_COLOR } from "@/lib/rarity";
import { CloseIcon, StarIcon } from "./Icons";

const ROOM = "/models/tiny_isometric_room.glb";

type GhUser = {
  login: string;
  name: string;
  bio: string | null;
  avatarUrl: string;
  followers: number;
  following: number;
  location: string | null;
  publicRepos: number;
  htmlUrl: string;
  topRepos: {
    name: string;
    stars: number;
    lang: string | null;
    langColor: string;
    url: string;
  }[];
};

const nf = (n: number) => new Intl.NumberFormat("en-US").format(n);

// The room model, centered at the origin so the camera can sit just inside it.
function Room() {
  const { scene } = useGLTF(ROOM);
  const room = useMemo(() => {
    const r = scene.clone(true);
    const box = new THREE.Box3().setFromObject(r);
    const c = new THREE.Vector3();
    box.getCenter(c);
    r.position.set(-c.x, -c.y, -c.z);
    r.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return r;
  }, [scene]);
  return <primitive object={room} />;
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
  const tier = tierForIndex(index);
  const fallbackLogin = stargazer?.login ?? nameForIndex(index);
  const profileUrl = stargazer?.profileUrl ?? `https://github.com/${fallbackLogin}`;

  // Live GitHub profile for the stargazer this house belongs to.
  const [user, setUser] = useState<GhUser | null>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    const login = stargazer?.login;
    if (!login) {
      setState("error");
      return;
    }
    let alive = true;
    setState("loading");
    setUser(null);
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
  const repos = user?.topRepos ?? [];

  return (
    <div
      className="anim-fade absolute inset-0 z-20 grid place-items-center bg-black/55 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="anim-rise relative grid h-[70vh] max-h-[560px] w-full max-w-[920px] grid-cols-1 overflow-hidden rounded-3xl border border-white/10 bg-[#0d141d] shadow-2xl shadow-black/60 md:grid-cols-[1.25fr_1fr]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Interior view */}
        <div className="relative hidden bg-[#0a0f16] md:block">
          <Canvas
            shadows
            camera={{ position: [2.6, 1.8, 2.6], fov: 40 }}
            gl={{ antialias: true }}
          >
            <color attach="background" args={["#0a0f16"]} />
            <Suspense fallback={null}>
              <ambientLight intensity={0.9} />
              <hemisphereLight intensity={0.6} color="#fff3e0" groundColor="#202830" />
              <directionalLight position={[3, 6, 4]} intensity={1.5} castShadow />
              <directionalLight position={[-4, 3, -2]} intensity={0.5} color="#cfe0ff" />
              <Room />
            </Suspense>
            <OrbitControls
              enablePan={false}
              minDistance={2}
              maxDistance={4.5}
              autoRotate
              autoRotateSpeed={0.6}
              maxPolarAngle={Math.PI / 1.9}
            />
          </Canvas>
        </div>

        {/* Info panel */}
        <div className="flex min-h-0 flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt={login}
                  className="h-12 w-12 shrink-0 rounded-full border border-white/15"
                />
              )}
              <div className="min-w-0">
                <span
                  className="mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{
                    background: TIER_COLOR[tier] + "26",
                    color: TIER_COLOR[tier],
                  }}
                >
                  {tier}
                </span>
                <h2 className="truncate text-xl font-semibold leading-tight text-white">
                  {displayName}
                </h2>
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-[13px] text-white/45 hover:text-white/70"
                >
                  @{login}
                </a>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          {/* bio + follower stats (real) */}
          {user?.bio && (
            <p className="text-[13px] leading-relaxed text-white/70">{user.bio}</p>
          )}
          {state === "done" && user && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-white/45">
              <span>
                <span className="font-semibold text-white/80">
                  {nf(user.followers)}
                </span>{" "}
                followers
              </span>
              <span>
                <span className="font-semibold text-white/80">
                  {nf(user.following)}
                </span>{" "}
                following
              </span>
              {user.location && <span>· {user.location}</span>}
            </div>
          )}

          {/* top repositories (real) */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-white/40">
              Top repositories
            </div>
            <ul className="space-y-2">
              {state === "loading" &&
                [0, 1, 2].map((k) => (
                  <li
                    key={k}
                    className="h-[52px] animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.03]"
                  />
                ))}
              {state === "error" && (
                <li className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-[12px] text-white/40">
                  No public GitHub data for this house yet.
                </li>
              )}
              {state === "done" && repos.length === 0 && (
                <li className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-[12px] text-white/40">
                  No public repositories.
                </li>
              )}
              {repos.map((r) => (
                <li key={r.name}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition hover:border-white/20 hover:bg-white/[0.06]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">
                        {r.name}
                      </div>
                      {r.lang && (
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/45">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: r.langColor }}
                          />
                          {r.lang}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-white/55">
                      <StarIcon className="h-3.5 w-3.5" />
                      <span className="tabular-nums text-xs">{nf(r.stars)}</span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-white py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            View GitHub profile
          </a>
        </div>
      </div>
    </div>
  );
}

useGLTF.preload(ROOM);
