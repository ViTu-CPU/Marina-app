/** U34: pick a City of Helsinki detailed-plan area on the map and make it the site. */
import { useState } from 'react';
import { appStore, useAppStore } from '../../state/store';
import { formatCount } from '../format';
import { usePlanArea, type PlanUse, type PlanUseResult } from '../tools/planPick';
import { useT } from '../useT';
import { Button } from './fields';

export function PlanPickControls() {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const tool = useAppStore((s) => s.tool);
  const pick = useAppStore((s) => s.planPick);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PlanUseResult | null>(null);
  const picking = tool === 'plan';
  const use = async (how: PlanUse) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = await usePlanArea(how);
      setDone(r);
      if (r && r.area > 0) {
        appStore.getState().setTool('select');
        appStore.getState().setPlanPick(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1 rounded border border-violet-200 bg-violet-50/50 p-2" data-testid="plan-pick">
      <Button active={picking} onClick={() => appStore.getState().setTool(picking ? 'select' : 'plan')}>
        {t('plan.pick')}
      </Button>
      {picking && !pick && <p className="text-xs text-violet-900">{t('plan.pickHint')}</p>}
      {pick?.status === 'loading' && (
        <p role="status" className="animate-pulse text-xs text-violet-900">
          {t('plan.loading')}
        </p>
      )}
      {pick?.status === 'none' && <p className="text-xs text-amber-800">{t('plan.none')}</p>}
      {pick?.status === 'error' && (
        <p role="alert" className="text-xs text-red-700">
          {t('plan.error')} {pick.message}
        </p>
      )}
      {pick?.status === 'found' && (
        <div className="space-y-1">
          <p className="text-sm text-slate-800" data-testid="plan-found">
            {t('plan.found')} <span className="font-medium">{pick.plan.code}</span>
            {pick.plan.inForce ? ` · ${t('plan.inForce')} ${pick.plan.inForce}` : ''}
            {pick.plan.serviceArea !== null ? ` · ${formatCount(pick.plan.serviceArea, language)} m²` : ''}
            {pick.others > 0 ? ` · ${t('plan.others').replace('{n}', String(pick.others))}` : ''}
          </p>
          <div className="flex flex-wrap gap-1">
            <Button variant="primary" disabled={busy} onClick={() => void use('water')}>
              {t('plan.useWater')}
            </Button>
            <Button disabled={busy} onClick={() => void use('whole')}>
              {t('plan.useWhole')}
            </Button>
            <Button disabled={busy} onClick={() => appStore.getState().setPlanPick(null)}>
              {t('plan.clear')}
            </Button>
          </div>
          {busy && (
            <p role="status" className="animate-pulse text-xs text-violet-900">
              {t('plan.working')}
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {t('plan.error')} {error}
        </p>
      )}
      {done && done.area === 0 && <p className="text-xs text-amber-800">{t('plan.noWater')}</p>}
      {done && done.area > 0 && (
        <p className="text-xs text-emerald-800" data-testid="plan-done">
          {t('plan.done')
            .replace('{area}', formatCount(done.area, language))
            .replace('{islands}', formatCount(done.islands, language))}{' '}
          {done.shoreline ? t('plan.shoreSuggested') : t('plan.shoreNone')}
          {done.otherParts > 0 ? ` ${t('plan.otherParts').replace('{n}', String(done.otherParts))}` : ''}
        </p>
      )}
      <p className="text-xs text-slate-500">{t('plan.note')}</p>
    </div>
  );
}
