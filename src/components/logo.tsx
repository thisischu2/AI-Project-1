"use client";

import { useId } from "react";

/** Minimalist six-node symbol: six points on a hexagon, joined to a center. */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const gid = `six-g-${useId().replace(/:/g, "")}`;
  const r = 9;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [12 + r * Math.cos(a), 12 + r * Math.sin(a)];
  });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      {pts.map(([x, y], i) => {
        const [nx, ny] = pts[(i + 1) % 6];
        return <line key={`e${i}`} x1={x} y1={y} x2={nx} y2={ny} stroke={`url(#${gid})`} strokeOpacity="0.45" strokeWidth="0.9" />;
      })}
      {pts.map(([x, y], i) => (
        <line key={`s${i}`} x1={12} y1={12} x2={x} y2={y} stroke={`url(#${gid})`} strokeOpacity="0.25" strokeWidth="0.7" />
      ))}
      {pts.map(([x, y], i) => (
        <circle key={`n${i}`} cx={x} cy={y} r={1.9} fill={`url(#${gid})`} />
      ))}
      <circle cx={12} cy={12} r={2.4} fill="#F4F4F5" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[0.18em] text-platinum">
        6IX <span className="text-silver font-medium">DEGREES</span>
      </span>
    </span>
  );
}
