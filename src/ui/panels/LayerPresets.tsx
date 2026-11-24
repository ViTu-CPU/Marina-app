/** UI_REVIEW 10: one click for a suitable set of map layers; "Custom" once layers are set one by one. */
import { appStore, LAYER_PRESETS, presetOf, useAppStore, type LayerPreset } from '../../state/store';
import { useT } from '../useT';

export function LayerPresets({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const current = useAppStore((s) => presetOf(s.layers));
  return (
    <div role="group" aria-label={t('layers.presets')} className={`flex flex-wrap items-center gap-1 ${compact ? 'text-xs' : 'text-sm'}`} data-testid="layer-presets">
      {!compact && <span className="mr-1 text-xs text-slate-500">{t('layers.presets')}:</span>}
      {(Object.keys(LAYER_PRESETS) as LayerPreset[]).map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={current === p}
          aria-label={`${t('layers.presets')}: ${t(`layers.preset.${p}`)}`}
          onClick={() => appStore.getState().setLayerPreset(p)}
          className={`rounded border px-1.5 py-0.5 ${current === p ? 'border-sky-600 bg-sky-100 text-sky-900' : 'border-slate-300 bg-white/90 text-slate-700 hover:bg-slate-100'}`}
        >
          {t(`layers.preset.${p}`)}
        </button>
      ))}
      {current === null && <span className="text-xs text-slate-500">({t('layers.custom')})</span>}
    </div>
  );
}
