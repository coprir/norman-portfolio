"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { clsx } from "clsx";

const Scene = dynamic(() => import("./scene"), { ssr: false });

/** Flat rendering of the capsule: shown while 3D loads, without WebGL, and for reduced motion. */
export function CapsulePoster({ open = false, className }: { open?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 400 400" fill="none" aria-hidden="true" className={clsx("size-full", className)}>
      <defs>
        <linearGradient id="cp-body" x1="0" x2="1">
          <stop offset="0" stopColor="#0d1222" />
          <stop offset="0.45" stopColor="#2a3355" />
          <stop offset="0.62" stopColor="#161c33" />
          <stop offset="1" stopColor="#0a0e1b" />
        </linearGradient>
        <radialGradient id="cp-glow">
          <stop offset="0" stopColor="#8aa6ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#8aa6ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="150" fill="url(#cp-glow)" opacity={open ? 1 : 0.5} />
      <g transform="rotate(24 200 200)">
        <ellipse cx="200" cy="200" rx="168" ry="52" stroke="#a8b0c4" strokeOpacity="0.4" strokeWidth="0.8" />
        <circle cx="368" cy="200" r="4" fill="#8aa6ff" />
        <g transform={open ? "translate(0 -34)" : undefined}>
          <path d="M152 198V140a48 48 0 0 1 96 0v58Z" fill="url(#cp-body)" />
          <rect x="150" y="188" width="100" height="10" fill="#c9d2ea" opacity="0.85" />
        </g>
        <g transform={open ? "translate(0 34)" : undefined}>
          <path d="M152 202v58a48 48 0 0 0 96 0v-58Z" fill="url(#cp-body)" />
          <rect x="150" y="202" width="100" height="10" fill="#c9d2ea" opacity="0.85" />
        </g>
        <rect x="150" y={open ? 166 : 198} width="100" height={open ? 68 : 4} fill="#dfe6ff" opacity={open ? 0.9 : 1} />
      </g>
    </svg>
  );
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function canUseWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * The capsule visual. Uses WebGL where it helps and quietly degrades: a
 * still frame for people who prefer reduced motion, a drawing where WebGL
 * isn't available.
 */
export function CapsuleVisual({ open = 0, className, particles }: { open?: number; className?: string; particles?: boolean }) {
  const [mode, setMode] = useState<"pending" | "3d" | "still" | "flat">("pending");
  useEffect(() => {
    if (!canUseWebGL()) return setMode("flat");
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMode(mq.matches ? "still" : "3d");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const poster = <CapsulePoster open={open > 0.5} />;
  return (
    <div className={className}>
      <div className="relative size-full">
      {mode === "pending" || mode === "flat" ? (
        <div className={clsx("absolute inset-0 grid place-items-center transition-opacity duration-700", mode === "pending" && "opacity-0")}>{poster}</div>
      ) : (
        <Boundary fallback={poster}>
          <div className="absolute inset-0 animate-[fadein_1.4s_ease-out]">
            <Scene open={open} still={mode === "still"} particles={particles} />
          </div>
        </Boundary>
      )}
      </div>
    </div>
  );
}
