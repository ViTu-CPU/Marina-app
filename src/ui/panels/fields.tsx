/** Small form controls shared by the side panels. */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { appStore } from '../../state/store';

export function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="border-b border-slate-200">
      <summary className="cursor-pointer select-none bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
        {title}
      </summary>
      <div className="space-y-2 px-3 py-2">{children}</div>
    </details>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Compact variant without a visible label (table cells); the label is still announced. */
  bare?: boolean;
}

/**
 * Numeric input. Keeps what the user is typing as text and reports a value only when it
 * is a valid number within the limits, so half-typed input never reaches the model.
 */
export function NumberField({ label, value, onChange, min, max, step = 0.1, bare = false }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const parsed = Number(text.replace(',', '.'));
  const valid = text.trim() !== '' && Number.isFinite(parsed) && (min === undefined || parsed >= min) && (max === undefined || parsed <= max);
  const input = (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      aria-label={bare ? label : undefined}
      aria-invalid={!valid}
      data-step={step}
      className={`w-full rounded border px-1.5 py-0.5 text-right text-sm tabular-nums ${valid ? 'border-slate-300' : 'border-red-500 bg-red-50'}`}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        appStore.getState().endCoalescing();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const next = Number(e.target.value.replace(',', '.'));
        const ok = e.target.value.trim() !== '' && Number.isFinite(next) && (min === undefined || next >= min) && (max === undefined || next <= max);
        if (ok && next !== value) onChange(next);
      }}
    />
  );
  if (bare) return input;
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-sm text-slate-700">
        {label}
      </label>
      <div className="w-20 shrink-0">{input}</div>
    </div>
  );
}

/**
 * Optional numeric table cell (D36): empty means "not given" (undefined), shown with a
 * placeholder such as an estimate. Reports only valid numbers within the limits, or undefined.
 */
export function OptionalNumberField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min: number;
  max: number;
  placeholder?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value === undefined ? '' : String(value));
  }, [value, focused]);
  const read = (s: string): number | undefined | null => {
    if (s.trim() === '') return undefined;
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };
  const valid = read(text) !== null;
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={!valid}
      placeholder={placeholder}
      className={`w-full rounded border px-0.5 py-0.5 text-right text-sm tabular-nums placeholder:text-xs placeholder:text-slate-400 ${valid ? 'border-slate-300' : 'border-red-500 bg-red-50'}`}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        appStore.getState().endCoalescing();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const next = read(e.target.value);
        if (next !== null && next !== value) onChange(next);
      }}
    />
  );
}

/**
 * Parses a list of lengths: entries separated by spaces or semicolons, a comma right after an
 * entry also separates ("4, 5, 10.5"), a comma inside an entry is a decimal comma ("10,5").
 * Returns sorted unique positive numbers, or null if an entry is not one.
 */
export function parseLengthList(text: string, allowZero = false): number[] | null {
  const tokens = text
    .split(/[;\s]+/)
    .map((x) => x.replace(/,+$/, ''))
    .filter((x) => x !== '');
  const values = tokens.map((x) => Number(x.replace(',', '.')));
  if (values.some((x) => !Number.isFinite(x) || x < 0 || (x === 0 && !allowZero))) return null;
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * A list of lengths in metres typed as text ("4, 5, 6, 10.5"); reported only when every
 * entry is a positive number. Empty = no list.
 */
export function LengthListField({
  label,
  value,
  onChange,
  allowZero = false,
  placeholder,
}: {
  label: string;
  value: number[];
  onChange: (value: number[]) => void;
  allowZero?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const shown = value.join('; ');
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(shown);
  }, [shown, focused]);
  const valid = parseLengthList(text, allowZero) !== null;
  return (
    <div className="space-y-0.5">
      <label htmlFor={id} className="text-sm text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        aria-invalid={!valid}
        className={`w-full rounded border px-1.5 py-0.5 text-sm tabular-nums ${valid ? 'border-slate-300' : 'border-red-500 bg-red-50'}`}
        value={text}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          appStore.getState().endCoalescing();
        }}
        onChange={(e) => {
          setText(e.target.value);
          const next = parseLengthList(e.target.value, allowZero);
          if (next && next.join(';') !== value.join(';')) onChange(next);
        }}
      />
    </div>
  );
}

export function Button({
  children,
  onClick,
  active = false,
  disabled = false,
  title,
  variant = 'default',
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  variant?: 'default' | 'primary' | 'danger';
}) {
  const style =
    variant === 'primary'
      ? 'border-sky-700 bg-sky-600 text-white hover:bg-sky-700'
      : variant === 'danger'
        ? 'border-red-300 bg-white text-red-700 hover:bg-red-50'
        : active
          ? 'border-sky-600 bg-sky-100 text-sky-900'
          : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active || undefined}
      className={`rounded border px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${style}`}
    >
      {children}
    </button>
  );
}
