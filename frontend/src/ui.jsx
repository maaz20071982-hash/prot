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
  X,
  Clock,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

export const ROLES = {
  WORKER: 'worker',
  SUPERVISOR: 'supervisor',
  SAFETY_OFFICER: 'safety_officer',
  ADMIN: 'admin'
};

/**
 * Rule 6: Persistent demo mode banner
 */
export function DemoBanner({ show = true }) {
  if (!show) return null;
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
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    iconColor: "text-emerald-400"
  };

  if (norm === "elevated") {
    config = {
      label: "ELEVATED RISK",
      icon: AlertTriangle,
      border: "border-amber-500/35",
      bg: "bg-amber-500/10",
      text: "text-amber-300",
      iconColor: "text-amber-400"
    };
  } else if (norm === "high") {
    config = {
      label: "HIGH RISK",
      icon: AlertOctagon,
      border: "border-orange-500/40",
      bg: "bg-orange-500/15",
      text: "text-orange-300",
      iconColor: "text-orange-400"
    };
  } else if (norm === "emergency") {
    // Rule 4: 'possible heat-related emergency'
    config = {
      label: "POSSIBLE HEAT-RELATED EMERGENCY",
      icon: Flame,
      border: "border-rose-500/60 shadow-lg shadow-rose-950/50",
      bg: "bg-rose-500/20 animate-pulse",
      text: "text-rose-200 font-bold",
      iconColor: "text-rose-400"
    };
  }

  const IconComponent = config.icon;
  const sizeClasses = size === "sm"
    ? "px-2.5 py-0.5 text-xs gap-1.5"
    : size === "lg"
    ? "px-4 py-1.5 text-sm gap-2"
    : "px-3 py-1 text-xs gap-1.5";

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border shadow-sm ${config.border} ${config.bg} ${config.text} ${sizeClasses}`}
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
export function SourceTag({ source, provider = null, age = null, isStale = false, size = "sm" }) {
  const s = (source || "Simulated").toLowerCase();

  let badgeProps = {
    icon: Cpu,
    label: "Simulated",
    classes: "border-purple-500/30 bg-purple-500/10 text-purple-300"
  };

  if (s.includes("manual")) {
    badgeProps = {
      icon: FileText,
      label: "Manual Entry",
      classes: "border-sky-500/30 bg-sky-500/10 text-sky-300"
    };
  } else if (s.includes("import")) {
    badgeProps = {
      icon: Database,
      label: "Imported Feed",
      classes: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
    };
  } else if (s.includes("external") || s.includes("verified")) {
    badgeProps = {
      icon: ShieldCheck,
      label: provider ? `External (${provider})` : "Verified external",
      classes: isStale
        ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
        : "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
    };
  }

  const Icon = badgeProps.icon;
  const sizeClasses = size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium border shadow-sm ${badgeProps.classes} ${sizeClasses}`}
      title={`Data origin: ${badgeProps.label}${isStale ? " (STALE >30m)" : ""}${age ? ` • Age: ${age}` : ""}`}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>{badgeProps.label}</span>
      {isStale && <span className="text-[10px] text-amber-400 font-bold ml-0.5">(STALE)</span>}
      {age && <span className="text-[10px] opacity-75 font-mono ml-0.5">{age}</span>}
    </span>
  );
}

/**
 * ChartCard container with accessible headers and actions
 */
export function ChartCard({ title, subtitle = null, badge = null, action = null, children, className = "" }) {
  return (
    <Card className={`relative overflow-hidden ${className}`}>
      {(title || subtitle || badge || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-industrial-800">
          <div>
            <div className="flex items-center gap-2">
              {title && <h3 className="font-semibold text-slate-100 text-sm tracking-wide">{title}</h3>}
              {badge && <div>{badge}</div>}
            </div>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="w-full">{children}</div>
    </Card>
  );
}

/**
 * Accessible EmptyState Placeholder
 */
export function EmptyState({
  icon: Icon = FileText,
  title = "No data available",
  message = "No records match the current filter or criteria.",
  actionText = null,
  onAction = null,
  className = ""
}) {
  return (
    <div className={`p-8 rounded-lg border border-dashed border-industrial-700/80 bg-industrial-950/50 text-center flex flex-col items-center justify-center my-4 ${className}`}>
      <div className="w-10 h-10 rounded-full bg-industrial-900 border border-industrial-700 flex items-center justify-center text-slate-400 mb-3">
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <h4 className="text-sm font-semibold text-slate-200 mb-1">{title}</h4>
      <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">{message}</p>
      {actionText && onAction && (
        <Button onClick={onAction} variant="secondary" size="sm">
          {actionText}
        </Button>
      )}
    </div>
  );
}

/**
 * Skeleton Loader
 */
export function Skeleton({ variant = "line", width, height, className = "" }) {
  const base = "animate-pulse bg-industrial-800/80 rounded";
  const style = {};
  if (width) style.width = width;
  if (height) style.height = height;

  if (variant === "circle") {
    return <div className={`${base} rounded-full ${className}`} style={{ width: width || 40, height: height || 40, ...style }} />;
  }
  if (variant === "rect") {
    return <div className={`${base} ${className}`} style={{ height: height || 120, ...style }} />;
  }
  return <div className={`${base} h-4 w-full my-1.5 ${className}`} style={style} />;
}

/**
 * Toast Notifications Container
 */
export function Toast({ toasts = [], onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => {
        const typeClasses = {
          success: "border-emerald-500/80 bg-emerald-950/95 text-emerald-200",
          error: "border-red-500/80 bg-red-950/95 text-red-200",
          warning: "border-amber-500/80 bg-amber-950/95 text-amber-200",
          info: "border-sky-500/80 bg-sky-950/95 text-sky-200"
        }[t.type || "info"];

        return (
          <div
            key={t.id || Math.random()}
            className={`pointer-events-auto p-3 rounded-lg border shadow-xl text-xs flex items-start justify-between gap-2.5 backdrop-blur-md animate-in slide-in-from-bottom-2 ${typeClasses}`}
            role="alert"
          >
            <div className="flex-1">
              {t.title && <div className="font-bold text-white mb-0.5">{t.title}</div>}
              <div className="text-[11px] leading-relaxed">{t.message}</div>
            </div>
            {onDismiss && (
              <button
                type="button"
                onClick={() => onDismiss(t.id)}
                className="text-slate-400 hover:text-white p-0.5 rounded"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Accessible Slide-Out Drawer
 */
export function Drawer({ isOpen, onClose, title, children, footer = null, position = "right" }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative ml-auto w-full max-w-md bg-industrial-900 border-l border-industrial-700 h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between p-4 border-b border-industrial-800">
          <h2 className="text-sm font-bold text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="p-4 border-t border-industrial-800 bg-industrial-950/80">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * ConfirmDialog Modal
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  loading = false
}) {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4 text-xs text-slate-300">
        <p className="leading-relaxed">{message}</p>
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-industrial-800">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={danger ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Processing..." : confirmText}
          </Button>
        </div>
      </div>
    </Modal>
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
 * Standard Accessible Industrial Card - Bespoke Human-Crafted Aesthetic
 */
export function Card({ children, className = "", title = null, subtitle = null, action = null }) {
  return (
    <div className={`bg-industrial-900/90 border border-industrial-800 rounded-xl p-4 sm:p-5 shadow-lg shadow-black/25 ring-1 ring-white/[0.04] backdrop-blur-md transition-all ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3 border-b border-industrial-800/80 pb-2.5">
          <div>
            {title && <h3 className="font-semibold text-zinc-100 text-sm tracking-wide">{title}</h3>}
            {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * High-Contrast Accessible Button - Tactile Human-Designed Polish
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
  const base = "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-industrial-950 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]";

  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs gap-1.5",
    md: "px-3.5 py-1.5 text-sm gap-2",
    lg: "px-4 py-2 text-base gap-2"
  }[size] || "px-3.5 py-1.5 text-sm gap-2";

  const variants = {
    primary: "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-industrial-950 font-bold border border-amber-400/60 shadow-md shadow-amber-950/20 focus:ring-amber-400",
    secondary: "bg-industrial-850 hover:bg-industrial-800 text-zinc-200 border border-industrial-700/80 hover:border-zinc-500/50 shadow-sm focus:ring-zinc-400",
    danger: "bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold border border-rose-400/50 shadow-md shadow-red-950/30 focus:ring-rose-400",
    warning: "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold border border-amber-400/40 shadow-sm focus:ring-amber-400",
    outline: "bg-transparent hover:bg-industrial-850 text-zinc-300 border border-industrial-700 hover:border-zinc-500 focus:ring-zinc-400",
  }[variant] || "bg-gradient-to-r from-amber-500 to-amber-600 text-industrial-950 font-bold";

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
 * Form Input Controls - Sleek Obsidian & Amber Focus
 */
export function Input({ label, value, onChange, type = "text", placeholder = "", required = false, hint = null }) {
  return (
    <div className="mb-3">
      {label && (
        <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full bg-industrial-950/90 border border-industrial-700/80 rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 focus:outline-none transition-all shadow-inner"
      />
      {hint && <p className="text-[11px] text-zinc-400 mt-1">{hint}</p>}
    </div>
  );
}

export function Select({ label, value, onChange, options = [], required = false }) {
  return (
    <div className="mb-3">
      {label && (
        <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
      )}
      <select
        value={value}
        onChange={onChange}
        required={required}
        className="w-full bg-industrial-950/90 border border-industrial-700/80 rounded-lg px-3.5 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 focus:outline-none transition-all shadow-inner cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-industrial-900 text-zinc-100">
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
        <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
      )}
      <textarea
        value={value}
        onChange={onChange}
        rows={rows}
        placeholder={placeholder}
        required={required}
        className="w-full bg-industrial-950/90 border border-industrial-700/80 rounded-lg px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 focus:outline-none transition-all shadow-inner"
      />
    </div>
  );
}

/**
 * Metric KPI Box
 */
export function StatCard({ label, value, unit = "", subtext = null, icon: Icon = null, alertColor = null }) {
  return (
    <div className="bg-industrial-900/90 border border-industrial-800 rounded-xl p-4 shadow-sm ring-1 ring-white/[0.03] transition-all hover:border-industrial-700">
      <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
        <span className="font-medium tracking-wide">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-zinc-400" aria-hidden="true" />}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono tracking-tight ${alertColor || "text-zinc-100"}`}>
          {value}
        </span>
        {unit && <span className="text-xs font-semibold text-zinc-400">{unit}</span>}
      </div>
      {subtext && <p className="text-[11px] text-zinc-400 mt-1.5">{subtext}</p>}
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
 * Continuous looping siren using Web Audio API for supervisor emergency takeover
 * Returns a function that stops the siren immediately
 */
export function startEmergencySiren() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return () => {};
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(750, ctx.currentTime);

    let isHigh = false;
    const interval = setInterval(() => {
      if (ctx.state === 'closed') {
        clearInterval(interval);
        return;
      }
      isHigh = !isHigh;
      try {
        osc.frequency.setTargetAtTime(isHigh ? 1150 : 700, ctx.currentTime, 0.12);
      } catch (err) {}
    }, 450);

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    return () => {
      clearInterval(interval);
      try {
        gain.gain.setTargetAtTime(0.001, ctx.currentTime, 0.05);
        setTimeout(() => {
          try {
            osc.stop();
            ctx.close();
          } catch (e) {}
        }, 80);
      } catch (e) {}
    };
  } catch (e) {
    return () => {};
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


