/**
 * Wave screening window (D40): a side tool that estimates wind waves at the site from the
 * longest fetch, its direction, the depth and extreme winds, compares them with the wave
 * climate criteria of UFC 4-152-07 and tells whether the berths look to need a wave
 * attenuator or a breakwater. Preliminary only.
 */
import { pierAxis } from '../../engine/rows';
import { bearingOf, waveAssessment, type WaveQuality } from '../../engine/waves';
import type { StringKey } from '../../i18n';
import { appStore, useAppStore } from '../../state/store';
import { formatCount, formatLength } from '../format';
import { useT } from '../useT';
import { Button, NumberField, OptionalNumberField } from './fields';

const state = () => appStore.getState();
const QUALITIES: WaveQuality[] = ['excellent', 'good', 'moderate'];
const AVERAGING = [600, 3600] as const;

/** Wave heights with two decimals: the criteria are 0.15–0.61 m (U25). */
const formatHeight = (m: number, language: 'en' | 'fi') => new Intl.NumberFormat(language === 'fi' ? 'fi-FI' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m);

function OptionalRow({ label, value, min, max, placeholder, onChange }: { label: string; value: number | null; min: number; max: number; placeholder?: string; onChange: (v: number | null) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-slate-700">
      <span>{label}</span>
      <div className="w-24 shrink-0">
        <OptionalNumberField label={label} value={value ?? undefined} min={min} max={max} {...(placeholder === undefined ? {} : { placeholder })} onChange={(v) => onChange(v ?? null)} />
      </div>
    </div>
  );
}

export function WaveTool() {
  const t = useT();
  const open = useAppStore((s) => s.waveToolOpen);
  const language = useAppStore((s) => s.language);
  const waves = useAppStore((s) => s.project.waves);
  const designDepth = useAppStore((s) => s.project.anchoring.depth);
  const piers = useAppStore((s) => s.project.layouts.find((l) => l.id === s.selectedLayoutId)?.piers ?? null);
  if (!open) return null;

  const depth = waves.fetchDepth ?? designDepth;
  const bearings = (piers ?? []).map((p) => ({ id: p.id, bearing: bearingOf(pierAxis(p).along) }));
  const result = waveAssessment(waves, depth, bearings);
  const set = (patch: Partial<typeof waves>, key: string) => state().setWaves(patch, { coalesce: `waves:${key}` });
  const len = (m: number) => formatLength(m, language);
  const h = (m: number) => formatHeight(m, language);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={() => state().setWaveToolOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('waves.title')}
        data-testid="wave-tool"
        className="w-full max-w-4xl rounded bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <h2 className="text-sm font-semibold text-slate-800">{t('waves.title')}</h2>
          <Button onClick={() => state().setWaveToolOpen(false)}>{t('waves.close')}</Button>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-[18rem_1fr]">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('waves.inputs')}</div>
            <OptionalRow label={t('waves.fetch')} value={waves.fetch} min={1} max={1e6} onChange={(fetch) => set({ fetch }, 'fetch')} />
            <NumberField label={t('waves.fetchFrom')} value={waves.fetchFrom} min={0} max={360} step={5} onChange={(v) => set({ fetchFrom: v % 360 }, 'fetchFrom')} />
            <OptionalRow
              label={t('waves.fetchDepth')}
              value={waves.fetchDepth}
              min={0.1}
              max={1000}
              placeholder={len(designDepth)}
              onChange={(fetchDepth) => set({ fetchDepth }, 'fetchDepth')}
            />
            <OptionalRow label={t('waves.wind1')} value={waves.wind1} min={0.1} max={80} onChange={(wind1) => set({ wind1 }, 'wind1')} />
            <OptionalRow label={t('waves.wind50')} value={waves.wind50} min={0.1} max={80} onChange={(wind50) => set({ wind50 }, 'wind50')} />
            <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
              {t('waves.windAveraging')}
              <select
                className="rounded border border-slate-300 px-1 py-0.5 text-sm"
                value={waves.windAveragingS}
                onChange={(e) => state().setWaves({ windAveragingS: Number(e.target.value) })}
              >
                {AVERAGING.map((a) => (
                  <option key={a} value={a}>
                    {t(`waves.avg${a}` as StringKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
              {t('waves.quality')}
              <select className="rounded border border-slate-300 px-1 py-0.5 text-sm" value={waves.quality} onChange={(e) => state().setWaves({ quality: e.target.value as WaveQuality })}>
                {QUALITIES.map((q) => (
                  <option key={q} value={q}>
                    {t(`waveQuality.${q}`)}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-slate-500">{t('waves.inputNote')}</p>
          </div>

          <div className="min-w-0 space-y-3 text-sm">
            {!result ? (
              <p className="text-slate-500">{t('waves.enter')}</p>
            ) : (
              <>
                <table className="w-full text-right tabular-nums" data-testid="wave-results">
                  <thead>
                    <tr className="text-xs text-slate-500">
                      <th className="text-left font-medium">{t('waves.event')}</th>
                      <th className="font-medium">{t('waves.windUsed')}</th>
                      <th className="font-medium">{t('waves.duration')}</th>
                      <th className="font-medium">{t('waves.hm0')}</th>
                      <th className="font-medium">{t('waves.tp')}</th>
                      <th className="font-medium">{t('waves.length')}</th>
                      <th className="font-medium">{t('waves.limitedBy')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.events.map((e) => (
                      <tr key={e.event}>
                        <td className="text-left">{t(`waveEvent.${e.event}`)}</td>
                        <td>{len(e.waves.u10)}</td>
                        <td>{formatCount(e.waves.averagingS / 60, language)}</td>
                        <td>{h(e.waves.hm0)}</td>
                        <td>{len(e.waves.tp)}</td>
                        <td>{len(e.waves.wavelength)}</td>
                        <td>{t(`waveLimit.${e.waves.limit}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('waves.criteria')}</div>
                  <table className="w-full text-right tabular-nums" data-testid="wave-checks">
                    <tbody>
                      {result.checks.map((c) => (
                        <tr key={`${c.heading}-${c.event}`}>
                          <td className="text-left">{t(`waveHeading.${c.heading}`)}</td>
                          <td className="text-left">{t(`waveEvent.${c.event}`)}</td>
                          <td>
                            {h(c.waves.hm0)} m {c.limit === null ? '' : `≤ ${h(c.limit)} m`}
                          </td>
                          <td className={c.ok === false ? 'font-medium text-red-700' : c.ok ? 'text-emerald-700' : 'text-slate-500'}>
                            {c.ok === null ? t('waves.noCriterion') : c.ok ? t('waves.ok') : t('waves.exceeds')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-1 text-xs text-slate-500">
                    {result.piers.length === 0
                      ? t('waves.noPiers')
                      : `${t('waves.piers')}: ${result.piers.map((p) => `${p.id} ${t(`waveHeading.${p.heading}`).toLowerCase()}`).join(', ')}`}
                  </p>
                </div>

                <div
                  data-testid="wave-advice"
                  className={`rounded border px-3 py-2 ${result.advice === 'none' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : result.advice === 'unknown' ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
                >
                  {t(`waveAdvice.${result.advice}`)}
                </div>
              </>
            )}
            <p className="text-xs text-slate-500">{t('waves.note')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
