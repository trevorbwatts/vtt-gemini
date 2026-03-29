import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { cn } from './types';
import { getDamageRgb } from './utils/damageColors';
import type { ActionRollResult, DamageRollResult } from './utils/actionParser';

// ── Mock data ──

const MOCK_NORMAL: ActionRollResult = {
  attackRoll: 14,
  attackBonus: 7,
  attackTotal: 21,
  isCrit: false,
  isFumble: false,
  damageResults: [
    { rolls: [5, 3], modifier: 4, total: 12, damageType: 'Slashing', diceNotation: '2d6' },
    { rolls: [4, 6], modifier: 0, total: 10, damageType: 'Fire', diceNotation: '2d6' },
  ],
  totalDamage: 22,
  rollMode: 'normal',
};

const MOCK_CRIT: ActionRollResult = {
  attackRoll: 20,
  attackBonus: 7,
  attackTotal: 27,
  isCrit: true,
  isFumble: false,
  damageResults: [
    { rolls: [6, 2, 5, 4], modifier: 4, total: 21, damageType: 'Slashing', diceNotation: '2d6' },
    { rolls: [3, 6, 5, 2], modifier: 0, total: 16, damageType: 'Fire', diceNotation: '2d6' },
  ],
  totalDamage: 37,
  rollMode: 'normal',
};

const MOCK_FUMBLE: ActionRollResult = {
  attackRoll: 1,
  attackBonus: 7,
  attackTotal: 8,
  isCrit: false,
  isFumble: true,
  damageResults: [
    { rolls: [4, 2], modifier: 4, total: 10, damageType: 'Slashing', diceNotation: '2d6' },
    { rolls: [3, 1], modifier: 0, total: 4, damageType: 'Fire', diceNotation: '2d6' },
  ],
  totalDamage: 14,
  rollMode: 'normal',
};

// ── Variation A: "Classic" — badge left, formula right, stacked damage rows ──

function VariationA({ result }: { result: ActionRollResult }) {
  const { attackRoll, attackBonus, attackTotal, isCrit, isFumble, damageResults, totalDamage } = result;
  return (
    <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-[var(--line)] bg-black/10">
        <h2 className="text-lg font-serif font-bold tracking-tight text-orange-400">Flame Tongue Greatsword</h2>
      </div>
      <div className="p-4 space-y-4">
        {/* Attack Roll */}
        <div>
          <p className="text-sm uppercase tracking-widest font-bold text-white/40 mb-2">Attack Roll</p>
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-sans text-white/30">
                <span>d20</span>
                <span className={cn(
                  'inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold',
                  isCrit && 'text-yellow-400 bg-yellow-500/15',
                  isFumble && 'text-red-400 bg-red-500/15',
                  !isCrit && !isFumble && 'text-white/60 bg-white/10',
                )}>{attackRoll}</span>
                <span>+</span>
                <span className="text-white/50">{attackBonus}</span>
              </div>
              {isCrit && <span className="text-xs font-bold uppercase tracking-widest text-yellow-400">Critical Hit!</span>}
              {isFumble && <span className="text-xs font-bold uppercase tracking-widest text-red-400">Critical Miss!</span>}
            </div>
            <div className={cn(
              'w-14 h-14 rounded-xl flex items-center justify-center text-3xl font-bold font-mono shrink-0',
              isCrit && 'bg-yellow-500/15 text-yellow-400 ring-2 ring-yellow-500/30',
              isFumble && 'bg-red-500/15 text-red-400 ring-2 ring-red-500/30',
              !isCrit && !isFumble && 'bg-white/10 text-white',
            )}>
              {attackTotal}
            </div>
          </div>
        </div>

        {/* Damage */}
        <div>
          <p className="text-sm uppercase tracking-widest font-bold text-white/40 mb-2">
            {isCrit ? 'Critical Damage' : 'Damage'}
          </p>
          <div className="space-y-2">
            {damageResults.map((dr, i) => {
              const rgb = getDamageRgb(dr.damageType);
              return (
                <div key={i} className="rounded-lg p-2.5" style={{ backgroundColor: `rgba(${rgb}, 0.06)`, border: `1px solid rgba(${rgb}, 0.12)` }}>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap flex-1">
                      <span className="text-xs font-bold font-sans text-white/30 mr-0.5">{dr.diceNotation}</span>
                      {dr.rolls.map((roll, j) => (
                        <span key={j} className="inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold font-sans opacity-60"
                          style={{ backgroundColor: `rgba(${rgb}, 0.12)`, color: `rgb(${rgb})` }}>{roll}</span>
                      ))}
                      {dr.modifier !== 0 && (
                        <span className="text-xs font-sans text-white/30">{dr.modifier > 0 ? '+' : '−'}{Math.abs(dr.modifier)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-bold uppercase tracking-wider opacity-50" style={{ color: `rgb(${rgb})` }}>{dr.damageType}</span>
                      <span className="text-xl font-bold font-sans" style={{ color: `rgb(${rgb})` }}>{dr.total}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[var(--line)]">
          <span className="text-sm uppercase tracking-widest font-bold text-white/40">Total Damage</span>
          <span className={cn('text-3xl font-bold font-sans', isCrit ? 'text-yellow-400' : 'text-orange-400')}>{totalDamage}</span>
        </div>
      </div>
    </div>
  );
}

// ── Variation B: "Hero" — centered d20, big attack total, horizontal damage cards ──

function VariationB({ result }: { result: ActionRollResult }) {
  const { attackRoll, attackBonus, attackTotal, isCrit, isFumble, damageResults, totalDamage } = result;
  return (
    <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden">
      <div className="p-4 border-b border-[var(--line)] bg-black/10 text-center">
        <h2 className="text-lg font-serif font-bold tracking-tight text-orange-400">Flame Tongue Greatsword</h2>
      </div>
      <div className="p-5 space-y-5">
        {/* Attack — centered hero layout */}
        <div className="text-center">
          <div className={cn(
            'w-20 h-20 rounded-2xl flex items-center justify-center text-4xl font-bold font-mono mx-auto mb-2',
            isCrit && 'bg-yellow-500/15 text-yellow-400 ring-2 ring-yellow-500/40',
            isFumble && 'bg-red-500/15 text-red-400 ring-2 ring-red-500/40',
            !isCrit && !isFumble && 'bg-white/10 text-white',
          )}>
            {attackRoll}
          </div>
          {isCrit && <p className="text-xs font-bold uppercase tracking-widest text-yellow-400 mb-1">Critical Hit!</p>}
          {isFumble && <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-1">Critical Miss!</p>}
          <p className="text-white/40 text-xs font-mono">
            d20 ({attackRoll}) + {attackBonus}
          </p>
          <p className="text-3xl font-bold font-mono text-white mt-1">{attackTotal}</p>
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold mt-0.5">To Hit</p>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--line)]" />

        {/* Damage — horizontal cards */}
        <div>
          <p className="text-[11px] uppercase tracking-widest font-bold text-white/40 mb-3 text-center">
            {isCrit ? 'Critical Damage' : 'Damage'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {damageResults.map((dr, i) => {
              const rgb = getDamageRgb(dr.damageType);
              return (
                <div key={i} className="rounded-xl p-3 text-center" style={{ backgroundColor: `rgba(${rgb}, 0.06)`, border: `1px solid rgba(${rgb}, 0.12)` }}>
                  <p className="text-[9px] font-bold uppercase tracking-wider mb-2 opacity-70" style={{ color: `rgb(${rgb})` }}>{dr.damageType}</p>
                  <p className="text-2xl font-bold font-mono mb-1.5" style={{ color: `rgb(${rgb})` }}>{dr.total}</p>
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    {dr.rolls.map((roll, j) => (
                      <span key={j} className="inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold font-mono"
                        style={{ backgroundColor: `rgba(${rgb}, 0.15)`, color: `rgb(${rgb})` }}>{roll}</span>
                    ))}
                    {dr.modifier !== 0 && (
                      <span className="text-[10px] font-mono text-white/40">
                        {dr.modifier > 0 ? '+' : '−'}{Math.abs(dr.modifier)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Total */}
        <div className="rounded-xl bg-black/20 border border-[var(--line)] p-3 text-center">
          <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-1">Total Damage</p>
          <p className={cn('text-3xl font-bold font-mono', isCrit ? 'text-yellow-400' : 'text-orange-400')}>{totalDamage}</p>
        </div>
      </div>
    </div>
  );
}

// ── Variation C: "Compact" — two-column, attack left damage right, dense info ──

function VariationC({ result }: { result: ActionRollResult }) {
  const { attackRoll, attackBonus, attackTotal, isCrit, isFumble, damageResults, totalDamage } = result;
  return (
    <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)] bg-black/10">
        <h2 className="text-base font-serif font-bold tracking-tight text-orange-400">Flame Tongue Greatsword</h2>
        {isCrit && <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded-full">Critical!</span>}
        {isFumble && <span className="text-[10px] font-bold uppercase tracking-widest text-red-400 bg-red-500/10 px-2 py-1 rounded-full">Fumble!</span>}
      </div>
      <div className="p-4">
        <div className="grid grid-cols-[140px_1fr] gap-4">
          {/* Left: Attack */}
          <div className="flex flex-col items-center justify-center rounded-xl bg-black/20 border border-[var(--line)] p-3">
            <p className="text-[9px] uppercase tracking-widest text-white/30 font-bold mb-2">Attack</p>
            <div className={cn(
              'w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold font-mono mb-1.5',
              isCrit && 'bg-yellow-500/15 text-yellow-400',
              isFumble && 'bg-red-500/15 text-red-400',
              !isCrit && !isFumble && 'bg-white/10 text-white/80',
            )}>
              {attackRoll}
            </div>
            <div className="flex items-center gap-1 text-[11px] font-mono text-white/40">
              <span>{attackRoll}</span>
              <span>+</span>
              <span>{attackBonus}</span>
            </div>
            <div className="w-8 border-t border-white/10 my-1" />
            <p className={cn(
              'text-xl font-bold font-mono',
              isCrit ? 'text-yellow-400' : isFumble ? 'text-red-400' : 'text-white',
            )}>{attackTotal}</p>
          </div>

          {/* Right: Damage */}
          <div className="space-y-2">
            {damageResults.map((dr, i) => {
              const rgb = getDamageRgb(dr.damageType);
              return (
                <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ backgroundColor: `rgba(${rgb}, 0.05)`, border: `1px solid rgba(${rgb}, 0.1)` }}>
                  {/* Dice row */}
                  <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
                    {dr.rolls.map((roll, j) => (
                      <span key={j} className="inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold font-mono"
                        style={{ backgroundColor: `rgba(${rgb}, 0.15)`, color: `rgb(${rgb})` }}>{roll}</span>
                    ))}
                    {dr.modifier !== 0 && (
                      <span className="text-[10px] font-mono text-white/40">{dr.modifier > 0 ? '+' : '−'}{Math.abs(dr.modifier)}</span>
                    )}
                  </div>
                  {/* Total + type */}
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold font-mono leading-none" style={{ color: `rgb(${rgb})` }}>{dr.total}</p>
                    <p className="text-[8px] font-bold uppercase tracking-wider opacity-50 mt-0.5" style={{ color: `rgb(${rgb})` }}>{dr.damageType}</p>
                  </div>
                </div>
              );
            })}
            {/* Total row */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--line)]">
              <span className="text-[10px] uppercase tracking-widest font-bold text-white/30">Total</span>
              <span className={cn('text-xl font-bold font-mono', isCrit ? 'text-yellow-400' : 'text-orange-400')}>{totalDamage}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Preview App ──

const TABS = ['A — Classic', 'B — Hero', 'C — Compact'] as const;
const SCENARIOS = ['Normal Hit', 'Critical Hit', 'Fumble'] as const;
const SCENARIO_DATA = [MOCK_NORMAL, MOCK_CRIT, MOCK_FUMBLE];

function PreviewApp() {
  const [tab, setTab] = useState(0);
  const [scenario, setScenario] = useState(0);

  const result = SCENARIO_DATA[scenario];
  const Variation = [VariationA, VariationB, VariationC][tab];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)] flex flex-col items-center py-8 px-4">
      <h1 className="text-2xl font-serif font-bold text-orange-400 mb-6">Dice Roll Modal — Design Variations</h1>

      {/* Design tabs */}
      <div className="flex gap-1 mb-4 bg-black/30 rounded-xl p-1">
        {TABS.map((label, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-bold transition-all',
              tab === i
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'text-white/40 hover:text-white/70 border border-transparent',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Scenario toggle */}
      <div className="flex gap-1 mb-8 bg-black/20 rounded-lg p-1">
        {SCENARIOS.map((label, i) => (
          <button
            key={i}
            onClick={() => setScenario(i)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all',
              scenario === i
                ? 'bg-white/10 text-white'
                : 'text-white/30 hover:text-white/50',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Render chosen variation */}
      <Variation result={result} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<PreviewApp />);
