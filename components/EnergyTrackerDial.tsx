'use client';

import { useEffect, useState } from 'react';

type EnergyTone = 'low' | 'medium' | 'high';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Daily energy curve (1-100), based on local time:
 * - 00:00–06:00: low and flat at 30
 * - 06:00–12:00: rapid rise from 30 -> 100 (quadratic ease-in)
 * - 12:00–15:00: steady high at 95
 * - 15:00–21:00: slow decline from 95 -> 30 (quadratic ease-out)
 * - 21:00–24:00: low and flat at 30
 */
export function getEnergyForTime(date: Date): number {
  const minutes = date.getHours() * 60 + date.getMinutes();

  if (minutes < 6 * 60) return 30;

  if (minutes < 12 * 60) {
    const t = (minutes - 6 * 60) / (6 * 60);
    const eased = t * t;
    return Math.round(30 + eased * (100 - 30));
  }

  if (minutes < 15 * 60) return 95;

  if (minutes < 21 * 60) {
    const t = (minutes - 15 * 60) / (6 * 60);
    const eased = 1 - Math.pow(1 - t, 2);
    return Math.round(95 - eased * (95 - 30));
  }

  return 30;
}

function getEnergyTone(energy: number): EnergyTone {
  if (energy <= 35) return 'low';
  if (energy >= 85) return 'high';
  return 'medium';
}

export function getEnergyVisuals(energy: number): {
  tone: EnergyTone;
  color: string;
  emoji: string;
  label: string;
} {
  const tone = getEnergyTone(energy);

  if (tone === 'low') {
    return { tone, color: 'text-red-400', emoji: '🪫', label: 'Low' };
  }
  if (tone === 'high') {
    return { tone, color: 'text-green-400', emoji: '⚡', label: 'High' };
  }
  return { tone, color: 'text-yellow-300', emoji: '🔋', label: 'Medium' };
}

interface EnergyTrackerDialProps {
  className?: string;
}

export default function EnergyTrackerDial({ className = '' }: EnergyTrackerDialProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const energy = getEnergyForTime(now);
  const visuals = getEnergyVisuals(energy);
  const normalized = clamp((energy - 1) / 99, 0, 1);

  const cx = 200;
  const cy = 220;
  const angleDeg = 180 - 180 * normalized;
  const angleRad = (angleDeg * Math.PI) / 180;

  const tipR = 174;
  const leftR = 18;
  const rightR = 18;
  const leftAngle = angleRad + Math.PI / 2;
  const rightAngle = angleRad - Math.PI / 2;

  const tipX = cx + tipR * Math.cos(angleRad);
  const tipY = cy + tipR * Math.sin(angleRad);
  const leftX = cx + leftR * Math.cos(leftAngle);
  const leftY = cy + leftR * Math.sin(leftAngle);
  const rightX = cx + rightR * Math.cos(rightAngle);
  const rightY = cy + rightR * Math.sin(rightAngle);

  return (
    <section className={`bg-slate-800 border border-slate-700 rounded-2xl p-6 ${className}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Energy Tracker</h2>
          <p className="text-sm text-slate-400 mt-0.5">Auto-updates through the day</p>
        </div>
        <div className="text-right">
          <p className={`text-3xl font-bold tabular-nums ${visuals.color}`}>{energy}/100</p>
          <p className="text-sm text-slate-300">
            {visuals.emoji} {visuals.label} energy
          </p>
        </div>
      </div>

      <div className="w-full flex justify-center">
        <svg viewBox="0 0 400 260" className="w-full max-w-2xl">
          <g>
            <rect x="16" y="228" rx="6" ry="6" width="34" height="24" fill="#000000" opacity="0.9" />
            <text x="33" y="245" textAnchor="middle" fontSize="16" fill="#ffffff" fontWeight="700">
              1
            </text>

            <rect x="178" y="12" rx="8" ry="8" width="44" height="28" fill="#000000" opacity="0.9" />
            <text x="200" y="32" textAnchor="middle" fontSize="18" fill="#ffffff" fontWeight="700">
              50
            </text>

            <rect x="350" y="228" rx="6" ry="6" width="46" height="24" fill="#000000" opacity="0.9" />
            <text x="373" y="245" textAnchor="middle" fontSize="16" fill="#ffffff" fontWeight="700">
              100
            </text>
          </g>

          <path d="M 30 220 A 170 170 0 0 1 370 220" fill="none" stroke="#1f2937" strokeWidth="30" strokeLinecap="round" />
          <path d="M 30 220 A 170 170 0 0 1 115 73" fill="none" stroke="#ef4444" strokeWidth="26" strokeLinecap="butt" />
          <path d="M 115 73 A 170 170 0 0 1 285 73" fill="none" stroke="#eab308" strokeWidth="26" strokeLinecap="butt" />
          <path d="M 285 73 A 170 170 0 0 1 370 220" fill="none" stroke="#22c55e" strokeWidth="26" strokeLinecap="butt" />

          <polygon points={`${leftX},${leftY} ${rightX},${rightY} ${tipX},${tipY}`} fill="#000000" stroke="#111827" strokeWidth="1" />
          <circle cx={cx} cy={cy} r="12" fill="#000000" stroke="#ffffff" strokeWidth="2" />

          <text x={tipX} y={tipY - 12} textAnchor="middle" fontSize="13" fill="#ffffff" className="font-semibold">
            {energy}
          </text>
        </svg>
      </div>
    </section>
  );
}
