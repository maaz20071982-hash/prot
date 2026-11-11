import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Flame,
  Info,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  FileText,
  Database,
  SlidersHorizontal,
  X
} from 'lucide-react';

/**
 * Rule 6: Persistent demo mode banner
 */
export function DemoBanner() {
  return (
    <div className="bg-amber-950/80 border-b border-amber-600/40 text-amber-200 px-4 py-1.5 text-xs font-semibold tracking-wide flex items-center justify-between sticky top-0 z-50 backdrop-blur-sm">
      <div className="flex items-center gap-2 mx-auto">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
        <span>
          <strong className="text-amber-100 uppercase tracking-wider">Prototype: synthetic data</strong> — For operational safety demonstration only. Not connected to active clinical or calibrated field telemetry.
        </span>
      </div>
    </div>
  );
}

/**
 * Rule 10: Risk is NEVER colour-only (icon + text).
 * Rule 4: Never state or imply a diagnosis or heatstroke prediction. Use 'possible heat-related emergency'.
 */
export function RiskBadge({ level, size = "md" }) {
  const norm = (level || "Normal").toLowerCase();

  let config = {
    label: "NORMAL (LOW RISK)",
    icon: CheckCircle2,
    border: "border-emerald-600/50",
    bg: "bg-emerald-950/40",
    text: "text-emerald-300",
    iconColor: "text-emerald-400"
  };

  if (norm === "elevated") {
    config = {
      label: "ELEVATED RISK",
      icon: AlertTriangle,
      border: "border-amber-500/60",
      bg: "bg-amber-950/50",
      text: "text-amber-300",
      iconColor: "text-amber-400"
    };
  } else if (norm === "high") {
    config = {
      label: "HIGH RISK",
      icon: AlertOctagon,
      border: "border-orange-500/70",
      bg: "bg-orange-950/50",
      text: "text-orange-300",
      iconColor: "text-orange-400"
    };
  } else if (norm === "emergency") {
    // Rule 4: 'possible heat-related emergency'
    config = {
      label: "POSSIBLE HEAT-RELATED EMERGENCY",
      icon: Flame,
      border: "border-red-500",
      bg: "bg-red-950/80 animate-pulse",
      text: "text-red-200 font-bold",
      iconColor: "text-red-400"
    };
  }

  const IconComponent = config.icon;
  const sizeClasses = size === "sm"
    ? "px-2 py-0.5 text-xs gap-1.5"
    : size === "lg"
    ? "px-3.5 py-1.5 text-sm gap-2"
    : "px-2.5 py-1 text-xs gap-1.5";

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-md border ${config.border} ${config.bg} ${config.text} ${sizeClasses}`}
      role="status"
      aria-label={`Safety tier: ${config.label}`}
    >
      <IconComponent className={`${size === "lg" ? "w-4 h-4" : "w-3.5 h-3.5"} ${config.iconColor} shrink-0`} aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}

/**
 * Rule 6: Every reading shows a source tag: Simulated, Manual, Imported or Verified external.
 * Simulated data is never presented as a sensor measurement.
 */
export function SourceTag({ source }) {
  const s = source || "Simulated";

  let badgeProps = {
    icon: Cpu,
    label: "Simulated",
    classes: "border-purple-600/40 bg-purple-950/40 text-purple-300"
  };

  if (s === "Manual") {
    badgeProps = {
      icon: FileText,
      label: "Manual Entry",
      classes: "border-blue-500/50 bg-blue-950/50 text-blue-300"
    };
  } else if (s === "Imported") {
    badgeProps = {
      icon: Database,
      label: "Imported Feed",
      classes: "border-cyan-600/40 bg-cyan-950/40 text-cyan-300"
    };
  } else if (s === "Verified external") {
    badgeProps = {
      icon: ShieldCheck,
      label: "Verified external",
      classes: "border-emerald-500/50 bg-emerald-950/50 text-emerald-300"
    };
  }

  const Icon = badgeProps.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${badgeProps.classes}`}
      title={`Data origin: ${badgeProps.label}. Simulated data is not a direct sensor telemetry.`}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>{badgeProps.label}</span>
    </span>
  );
}

/**
 * Rule 5: Temperature and humidity never appear as measured WBGT.
 * Label 'WBGT estimate (proxy)' unless a manual instrument value is entered ('measured').
 * Show a limitations tooltip.
 */
export function WbgtLabelWithTooltip({ isMeasured = false, value = null, showValue = true }) {
  const [open, setOpen] = useState(false);
  const label = isMeasured ? "WBGT (measured)" : "WBGT estimate (proxy)";
  const tooltipText = isMeasured
    ? "Measured on-site via calibrated dry-bulb, natural wet-bulb, and black globe instrument complying with ISO 7243."
    : "Proxy calculation estimates wet bulb globe temperature based on ambient dry-bulb temperature and relative humidity without direct black-globe radiant heat or natural air velocity measurement. May underestimate heat stress in direct sunlight or high radiant heat environments. Verify with calibrated WBGT meter (ISO 7243) before high-risk tasks.";

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <div className="inline-flex items-center gap-1 text-slate-300 text-xs">
        <span className="font-semibold text-slate-200">{label}</span>
        {showValue && value !== null && (
          <span className="text-white font-mono font-bold">{value}°C</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-slate-400 hover:text-sky-300 transition-colors p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-sky-400"
        aria-label="View WBGT calculation limitations"
      >
        <Info className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute z-50 bottom-full left-0 mb-2 w-72 p-2.5 text-xs leading-relaxed bg-slate-900 border border-slate-700 text-slate-200 rounded-md shadow-2xl backdrop-blur-md"
        >
          <div className="font-semibold text-sky-400 mb-1 flex items-center gap-1">
            <Info className="w-3 h-3" />
            <span>ISO 7243 Methodology Disclaimer</span>
          </div>
          <p>{tooltipText}</p>
          <div className="mt-1.5 text-[10px] text-slate-400 border-t border-slate-800 pt-1">
            Click outside or hover away to dismiss.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Standard Accessible Industrial Card
 */
export function Card({ children, className = "", title = null, subtitle = null, action = null }) {
  return (
    <div className={`bg-industrial-900/90 border border-industrial-700/70 rounded-lg p-4 shadow-sm backdrop-blur-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3 border-b border-industrial-800 pb-2">
          <div>
            {title && <h3 className="font-semibold text-slate-100 text-sm tracking-wide">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * High-Contrast Accessible Button
 */
export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled = false,
  className = "",
  type = "button",
  ariaLabel
}) {
  const base = "inline-flex items-center justify-center font-medium rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-industrial-950 disabled:opacity-50 disabled:cursor-not-allowed";

  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs gap-1.5",
    md: "px-3.5 py-1.5 text-sm gap-2",
    lg: "px-4 py-2 text-base gap-2"
  }[size] || "px-3.5 py-1.5 text-sm gap-2";

  const variants = {
    primary: "bg-sky-600 hover:bg-sky-500 text-white focus:ring-sky-400 border border-sky-500/50 shadow-sm",
    secondary: "bg-industrial-800 hover:bg-industrial-700 text-slate-200 border border-industrial-600/70 focus:ring-slate-400",
    danger: "bg-red-700 hover:bg-red-600 text-white border border-red-500 focus:ring-red-400 font-bold",
    warning: "bg-amber-600 hover:bg-amber-500 text-white border border-amber-400 focus:ring-amber-400",
    outline: "bg-transparent hover:bg-industrial-800 text-slate-300 border border-industrial-600 focus:ring-slate-400",
  }[variant] || "bg-sky-600 text-white";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${base} ${sizeClasses} ${variants} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Accessible Modal Dialog
 */
export function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-industrial-900 border border-industrial-700 rounded-lg max-w-lg w-full p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-industrial-800 mb-4">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Form Input Controls
 */
export function Input({ label, value, onChange, type = "text", placeholder = "", required = false, hint = null }) {
  return (
    <div className="mb-3">
      {label && (
        <label className="block text-xs font-medium text-slate-300 mb-1">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full bg-industrial-950 border border-industrial-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
      />
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export function Select({ label, value, onChange, options = [], required = false }) {
  return (
    <div className="mb-3">
      {label && (
        <label className="block text-xs font-medium text-slate-300 mb-1">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <select
        value={value}
        onChange={onChange}
        required={required}
        className="w-full bg-industrial-950 border border-industrial-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Textarea({ label, value, onChange, rows = 3, placeholder = "", required = false }) {
  return (
    <div className="mb-3">
      {label && (
        <label className="block text-xs font-medium text-slate-300 mb-1">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <textarea
        value={value}
        onChange={onChange}
        rows={rows}
        placeholder={placeholder}
        required={required}
        className="w-full bg-industrial-950 border border-industrial-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
      />
    </div>
  );
}

/**
 * Metric KPI Box
 */
export function StatCard({ label, value, unit = "", subtext = null, icon: Icon = null, alertColor = null }) {
  return (
    <div className="bg-industrial-900 border border-industrial-800 rounded-lg p-3">
      <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
        <span>{label}</span>
        {Icon && <Icon className="w-4 h-4 text-slate-400" aria-hidden="true" />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-bold font-mono ${alertColor || "text-slate-100"}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-slate-400">{unit}</span>}
      </div>
      {subtext && <p className="text-[11px] text-slate-400 mt-1">{subtext}</p>}
    </div>
  );
}

/**
 * Web Audio API in-app alert tone generator (Synthesizer, no external MP3s required)
 */
export function playAlertSound(isEmergency = false) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isEmergency ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(isEmergency ? 880 : 587.33, ctx.currentTime);
    if (isEmergency) {
      osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.15);
    }
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (isEmergency ? 0.4 : 0.25));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (isEmergency ? 0.45 : 0.3));
  } catch (e) {
    // Ignore audio autoplay restrictions
  }
}

/**
 * Severity Badge for Incidents & Priorities
 */
export function SeverityBadge({ severity }) {
  const sev = (severity || 'Medium').toLowerCase();
  let colors = 'bg-slate-800 text-slate-300 border-slate-700';
  if (sev === 'low') {
    colors = 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50';
  } else if (sev === 'medium') {
    colors = 'bg-amber-950/60 text-amber-300 border-amber-500/50';
  } else if (sev === 'high') {
    colors = 'bg-orange-950/60 text-orange-300 border-orange-500/60';
  } else if (sev === 'critical') {
    colors = 'bg-red-950/80 text-red-200 border-red-500 font-bold animate-pulse';
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${colors}`}>
      {severity ? severity.toUpperCase() : 'MEDIUM'}
    </span>
  );
}

/**
 * Recovery Indicator Pill
 */
export function RecoveryIndicatorPill({ met, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border ${
      met
        ? 'bg-emerald-950/40 text-emerald-300 border-emerald-600/50'
        : 'bg-industrial-950 text-slate-400 border-industrial-800'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${met ? 'bg-emerald-400' : 'bg-slate-500'}`} />
      <span>{label}</span>
    </span>
  );
}

/**
 * Requirement 6: Persistent 'Decision support, not a medical device' footer on every screen.
 */
export function SafetyFooter() {
  return (
    <footer className="mt-auto border-t border-industrial-800 bg-industrial-950/90 text-slate-400 px-4 py-3 text-xs backdrop-blur-sm print:hidden">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-300">THERMOSENSE</span>
          <span className="text-slate-600">|</span>
          <span className="text-[11px] text-slate-400">Software-Only Occupational Heat-Safety Decision Support</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="px-2 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-600/40 font-medium">
            Decision support, not a medical device
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-500 font-mono">v3.0.0-sprint3</span>
        </div>
      </div>
    </footer>
  );
}


