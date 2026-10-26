import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { CatAvatar, AVATAR_COUNT } from '../art';
import { sfx, unlockAudio } from '../audio/sfx';

type Variant = 'primary' | 'neon' | 'ghost' | 'danger' | 'mint' | 'plain';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-[#ffb648] to-[#ff7a1c] text-[#2a1203] shadow-[0_6px_0_#b44c00,0_10px_24px_rgba(255,140,30,0.35)]',
  neon: 'bg-gradient-to-b from-[#5cf0ff] to-[#14b8d6] text-[#04222b] shadow-[0_6px_0_#0a7f96,0_10px_24px_rgba(34,229,255,0.3)]',
  mint: 'bg-gradient-to-b from-[#6ef0b8] to-[#14b47a] text-[#03261a] shadow-[0_6px_0_#0b7a52,0_10px_24px_rgba(52,211,153,0.3)]',
  danger: 'bg-gradient-to-b from-[#ff7b93] to-[#e11d48] text-white shadow-[0_6px_0_#8f1030,0_10px_24px_rgba(225,29,72,0.35)]',
  ghost: 'bg-white/8 text-white border border-white/15 hover:bg-white/14 shadow-[0_4px_0_rgba(0,0,0,0.35)]',
  plain: 'bg-transparent text-white/80 hover:text-white',
};

export function Button({
  children,
  onClick,
  variant = 'primary',
  className = '',
  disabled,
  size = 'md',
  type = 'button',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit';
  title?: string;
}) {
  const sz =
    size === 'lg'
      ? 'min-h-14 px-6 text-lg rounded-2xl'
      : size === 'sm'
        ? 'min-h-9 px-3 text-sm rounded-xl'
        : 'min-h-12 px-5 text-base rounded-2xl';
  return (
    <motion.button
      type={type}
      title={title}
      whileTap={disabled ? undefined : { scale: 0.95, y: 3 }}
      whileHover={disabled ? undefined : { y: -1 }}
      disabled={disabled}
      onClick={() => {
        unlockAudio();
        if (disabled) return;
        sfx.click();
        onClick?.();
      }}
      className={`inline-flex select-none items-center justify-center gap-2 font-extrabold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none ${sz} ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </motion.button>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-3xl p-4 sm:p-6 ${className}`}>{children}</div>;
}

export function Screen({
  title,
  onBack,
  children,
  wide,
  right,
}: {
  title: string;
  onBack?: () => void;
  children: ReactNode;
  wide?: boolean;
  right?: ReactNode;
}) {
  return (
    <div className="relative z-10 flex h-full flex-col">
      <header className="flex items-center gap-3 px-4 pb-2 pt-[calc(12px+var(--safe-t))] sm:px-6">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="!min-h-10 !px-3" title="Буцах">
            <span className="text-xl leading-none">←</span>
            <span className="hidden sm:inline">Буцах</span>
          </Button>
        )}
        <h1 className="flex-1 truncate text-xl font-black sm:text-2xl">{title}</h1>
        {right}
      </header>
      <div className="thin-scroll flex-1 overflow-y-auto px-4 pb-[calc(24px+var(--safe-b))] sm:px-6">
        <div className={`mx-auto w-full ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}>{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-sm font-bold text-violet-200/90">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-violet-200/60">{hint}</div>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-xl border border-violet-300/25 bg-[#120a2c]/80 px-3.5 py-3 text-base font-semibold text-white outline-none placeholder:text-violet-200/35 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/25';

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <select
      className={`${inputCls} appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2322e5ff' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")] bg-[length:14px] bg-[right_14px_center] bg-no-repeat pr-10 ${className}`}
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        const opt = options.find((o) => String(o.value) === raw);
        if (opt) onChange(opt.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)} className="bg-[#1a0f3a]">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-2xl bg-black/25 p-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => {
            sfx.click();
            onChange(o.value);
          }}
          className={`min-h-10 flex-1 rounded-xl px-3 text-sm font-extrabold transition ${
            o.value === value
              ? 'bg-gradient-to-b from-[#5cf0ff] to-[#14b8d6] text-[#04222b] shadow-[0_0_16px_rgba(34,229,255,0.45)]'
              : 'text-violet-100/80 hover:bg-white/10'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        sfx.click();
        onChange(!checked);
      }}
      className="flex w-full items-center gap-3 rounded-2xl bg-black/20 px-4 py-3 text-left"
    >
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-cyan-400 shadow-[0_0_14px_rgba(34,229,255,0.6)]' : 'bg-white/15'}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`}
        />
      </span>
      <span>
        <span className="block font-extrabold">{label}</span>
        {hint && <span className="block text-xs text-violet-200/65">{hint}</span>}
      </span>
    </button>
  );
}

export function Modal({
  open,
  children,
  onClose,
  className = '',
  z = 'z-[60]',
}: {
  open: boolean;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  z?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 ${z} flex items-center justify-center bg-[#05020f]/70 p-3 backdrop-blur-sm sm:p-6`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={`glass thin-scroll max-h-[calc(100dvh-24px)] w-full max-w-lg overflow-y-auto rounded-3xl p-4 sm:p-6 ${className}`}
            initial={{ scale: 0.85, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AvatarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {Array.from({ length: AVATAR_COUNT }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            sfx.meow();
            onChange(i);
          }}
          className={`aspect-square rounded-2xl p-1 transition ${
            value === i ? 'bg-cyan-400/25 ring-2 ring-cyan-300 shadow-[0_0_18px_rgba(34,229,255,0.45)]' : 'bg-black/20 hover:bg-white/10'
          }`}
          aria-label={`Муур ${i + 1}`}
        >
          <CatAvatar index={i} mood={value === i ? 'happy' : 'idle'} className="h-full w-full" />
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-[3px] border-cyan-300/30 border-t-cyan-300 ${className}`}
    />
  );
}

export function Toast({ text, tone = 'info' }: { text: string; tone?: 'info' | 'error' | 'good' }) {
  const cls =
    tone === 'error'
      ? 'border-rose-400/60 bg-rose-500/25'
      : tone === 'good'
        ? 'border-emerald-300/60 bg-emerald-500/20'
        : 'border-cyan-300/40 bg-[#1a0f3a]/90';
  return <div className={`rounded-2xl border px-4 py-2.5 text-sm font-bold shadow-xl backdrop-blur ${cls}`}>{text}</div>;
}
