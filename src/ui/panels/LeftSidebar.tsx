/** Left sidebar (SPEC §8): project, site tools, boat classes, parameters, objective, layers. */
import { useRef, useState } from 'react';
import { distance } from '../../engine/geometry';
import type { BoatClass, ObjectiveId, ObstacleKind, Params, ZoneKind } from '../../engine/model';
import type { StringKey } from '../../i18n';
import { appStore, LAYER_IDS, useAppStore, type ToolId } from '../../state/store';
import { loadImage, readFileAsDataUrl } from '../export/download';
import { formatLength, formatPercent } from '../format';
import { calibrateBackground, placeBackground } from '../tools/background';
import { deleteSiteObject, hasEntrance } from '../tools/sitePaths';
import { useT } from '../useT';
import { Button, NumberField, Section } from './fields';

const state = () => appStore.getState();

const TOOLS: { id: ToolId; hint: StringKey }[] = [
  { id: 'select', hint: 'hint.select' },
  { id: 'edit', hint: 'hint.edit' },
  { id: 'water', hint: 'hint.polygon' },
  { id: 'shoreline', hint: 'hint.polyline' },
  { id: 'entrance', hint: 'hint.entrance' },
  { id: 'obstacle', hint: 'hint.polygon' },
  { id: 'zone', hint: 'hint.polygon' },
  { id: 'measure', hint: 'hint.measure' },
];

const OBSTACLE_KINDS: ObstacleKind[] = ['rock', 'pier', 'island', 'structure', 'other'];
const ZONE_KINDS: ZoneKind[] = ['noNavigation', 'noStructures', 'protected'];
const OBJECTIVES: ObjectiveId[] = ['maxCapacity', 'spaceEfficiency', 'minInfrastructure', 'balanced'];
const CLASS_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#2dd4bf', '#f472b6'];

function ProjectSection() {
  const t = useT();
  const name = useAppStore((s) => s.project.name);
  return (
    <Section title={t('section.project')}>
      <label className="block text-sm text-slate-700">
        {t('project.name')}
        <input
          className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-0.5 text-sm"
          value={name}
          onChange={(e) => state().setProjectName(e.target.value)}
          onBlur={() => state().endCoalescing()}
        />
      </label>
    </Section>
  );
}

function SiteSection() {
  const t = useT();
  const tool = useAppStore((s) => s.tool);
  const site = useAppStore((s) => s.project.site);
  const obstacleKind = useAppStore((s) => s.obstacleKind);
  const zoneKind = useAppStore((s) => s.zoneKind);
  const draft = useAppStore((s) => s.draft);
  const language = useAppStore((s) => s.language);
  const hint = TOOLS.find((x) => x.id === tool)?.hint ?? (tool === 'calibrate' ? 'hint.calibrate' : null);

  const objects: { key: string; label: string }[] = [];
  if (site.water.length > 0) objects.push({ key: 'water', label: t('site.water') });
  if (site.shoreline.length > 0) objects.push({ key: 'shoreline', label: t('site.shoreline') });
  if (hasEntrance(site)) objects.push({ key: 'entrance', label: t('site.entrance') });
  for (const o of site.obstacles) objects.push({ key: `obstacle:${o.id}`, label: `${t(`kind.${o.kind}`)} (${o.id})` });
  for (const z of site.zones) objects.push({ key: `zone:${z.id}`, label: `${t(`zone.${z.kind}`)} (${z.id})` });

  return (
    <Section title={t('section.site')}>
      <div className="grid grid-cols-2 gap-1">
        {TOOLS.map(({ id }) => (
          <Button key={id} active={tool === id} onClick={() => state().setTool(id)}>
            {t(`tool.${id}`)}
          </Button>
        ))}
      </div>
      {hint && <p className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{t(hint)}</p>}
      {tool === 'measure' && draft.length === 2 && (
        <p className="text-sm font-medium text-violet-700">
          {t('measure.distance')}: {formatLength(distance(draft[0]!, draft[1]!), language)} m
        </p>
      )}
      {tool === 'obstacle' && (
        <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
          {t('site.obstacleKind')}
          <select className="rounded border border-slate-300 px-1 py-0.5 text-sm" value={obstacleKind} onChange={(e) => state().setObstacleKind(e.target.value as ObstacleKind)}>
            {OBSTACLE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kind.${k}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      {tool === 'zone' && (
        <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
          {t('site.zoneKind')}
          <select className="rounded border border-slate-300 px-1 py-0.5 text-sm" value={zoneKind} onChange={(e) => state().setZoneKind(e.target.value as ZoneKind)}>
            {ZONE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`zone.${k}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div>
        <div className="text-xs font-medium text-slate-500">{t('site.objects')}</div>
        {objects.length === 0 ? (
          <p className="text-xs text-slate-500">{t('site.empty')}</p>
        ) : (
          <ul className="text-sm">
            {objects.map((o) => (
              <li key={o.key} className="flex items-center justify-between py-0.5">
                <span className="truncate">{o.label}</span>
                <button
                  type="button"
                  className="rounded px-1 text-xs text-red-700 hover:bg-red-50"
                  aria-label={`${t('site.delete')}: ${o.label}`}
                  onClick={() => state().updateSite((s) => deleteSiteObject(s, o.key))}
                >
                  {t('site.delete')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function BackgroundSection() {
  const t = useT();
  const background = useAppStore((s) => s.project.background);
  const tool = useAppStore((s) => s.tool);
  const draft = useAppStore((s) => s.draft);
  const fileInput = useRef<HTMLInputElement>(null);
  const [realDistance, setRealDistance] = useState(50);

  const load = async (file: File) => {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const image = await loadImage(dataUrl);
      const s = state();
      // Start with the image filling most of the current view; calibration sets the real scale.
      const widthMetres = (s.viewport.width * 0.8) / s.view.zoom;
      s.setBackground(placeBackground(dataUrl, { width: image.width, height: image.height }, { x: s.view.cx, y: s.view.cy }, widthMetres));
    } catch {
      state().setNotice('The image could not be read.');
    }
  };

  return (
    <Section title={t('section.background')} defaultOpen={false}>
      <div className="flex flex-wrap gap-1">
        <Button onClick={() => fileInput.current?.click()}>{t('background.load')}</Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid="background-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void load(file);
          }}
        />
        {background && (
          <>
            <Button active={tool === 'calibrate'} onClick={() => state().setTool('calibrate')}>
              {t('tool.calibrate')}
            </Button>
            <Button variant="danger" onClick={() => state().setBackground(null)}>
              {t('background.remove')}
            </Button>
          </>
        )}
      </div>
      {background && (
        <>
          <p className="text-xs text-slate-600">
            {t('background.scale')}: {background.metresPerPixel.toFixed(3)} {t('background.metresPerPixel')}
          </p>
          {tool === 'calibrate' && (
            <div className="space-y-1 rounded bg-slate-100 p-2">
              <p className="text-xs text-slate-600">{t('hint.calibrate')}</p>
              <NumberField label={t('background.realDistance')} value={realDistance} min={0.1} onChange={setRealDistance} />
              <Button
                variant="primary"
                disabled={draft.length < 2}
                onClick={() => {
                  const calibrated = calibrateBackground(background, draft[0]!, draft[1]!, realDistance);
                  if (calibrated) {
                    state().setBackground(calibrated);
                    state().setTool('select');
                  }
                }}
              >
                {t('background.apply')}
              </Button>
            </div>
          )}
          <NumberField label={t('background.rotation')} value={background.rotation} min={-360} max={360} step={1} onChange={(rotation) => state().setBackground({ ...background, rotation }, { coalesce: 'bg-rotation' })} />
          <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
            {t('background.opacity')}
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={background.opacity}
              onChange={(e) => state().setBackground({ ...background, opacity: Number(e.target.value) }, { coalesce: 'bg-opacity' })}
              onPointerUp={() => state().endCoalescing()}
            />
          </label>
        </>
      )}
    </Section>
  );
}

function BoatClassesSection() {
  const t = useT();
  const classes = useAppStore((s) => s.project.boatClasses);
  const language = useAppStore((s) => s.language);
  const update = (id: string, patch: Partial<BoatClass>, field: string) =>
    state().setBoatClasses(
      classes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      { coalesce: `class:${id}:${field}` },
    );
  const add = () => {
    let n = classes.length + 1;
    while (classes.some((c) => c.id === `class-${n}`)) n++;
    state().setBoatClasses([
      ...classes,
      { id: `class-${n}`, name: '6 m', length: 6, beam: 2.3, color: CLASS_COLORS[classes.length % CLASS_COLORS.length]!, share: 0.1 },
    ]);
  };
  const shareSum = classes.reduce((sum, c) => sum + c.share, 0);

  return (
    <Section title={t('section.boats')}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="font-medium">{t('boats.name')}</th>
            <th className="font-medium">{t('boats.length')}</th>
            <th className="font-medium">{t('boats.beam')}</th>
            <th className="font-medium">{t('boats.share')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.id}>
              <td className="pr-1">
                <div className="flex items-center gap-1">
                  <input
                    type="color"
                    aria-label={`${t('boats.color')}: ${c.name}`}
                    className="h-5 w-5 shrink-0 cursor-pointer border-0 bg-transparent p-0"
                    value={c.color}
                    onChange={(e) => update(c.id, { color: e.target.value }, 'color')}
                    onBlur={() => state().endCoalescing()}
                  />
                  <input
                    aria-label={`${t('boats.name')}: ${c.name}`}
                    className="w-14 rounded border border-slate-300 px-1 py-0.5 text-sm"
                    value={c.name}
                    onChange={(e) => update(c.id, { name: e.target.value }, 'name')}
                    onBlur={() => state().endCoalescing()}
                  />
                </div>
              </td>
              <td className="w-14 pr-1">
                <NumberField bare label={`${t('boats.length')}: ${c.name}`} value={c.length} min={1} max={100} onChange={(length) => update(c.id, { length }, 'length')} />
              </td>
              <td className="w-14 pr-1">
                <NumberField bare label={`${t('boats.beam')}: ${c.name}`} value={c.beam} min={0.5} max={30} onChange={(beam) => update(c.id, { beam }, 'beam')} />
              </td>
              <td className="w-14 pr-1">
                <NumberField
                  bare
                  label={`${t('boats.share')}: ${c.name}`}
                  value={Math.round(c.share * 1000) / 10}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(percent) => update(c.id, { share: percent / 100 }, 'share')}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="rounded px-1 text-red-700 hover:bg-red-50 disabled:opacity-30"
                  aria-label={`${t('boats.delete')}: ${c.name}`}
                  disabled={classes.length <= 1}
                  onClick={() => state().setBoatClasses(classes.filter((x) => x.id !== c.id))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between">
        <Button onClick={add}>{t('boats.add')}</Button>
        <span className={`text-xs ${Math.abs(shareSum - 1) > 0.005 ? 'text-amber-700' : 'text-slate-500'}`} title={t('boats.shareNote')}>
          {t('boats.shareSum')} {formatPercent(shareSum, language)}
        </span>
      </div>
    </Section>
  );
}

type NumericParam = Exclude<keyof Params, 'boatsPerBay' | 'orientation'>;

function ParamField({ name, min, max, step }: { name: NumericParam; min: number; max: number; step?: number }) {
  const t = useT();
  const value = useAppStore((s) => s.project.params[name]);
  return (
    <NumberField
      label={t(`param.${name}`)}
      value={value}
      min={min}
      max={max}
      {...(step === undefined ? {} : { step })}
      onChange={(v) => state().setParams({ [name]: v }, { coalesce: `param:${name}` })}
    />
  );
}

function DockSection() {
  const t = useT();
  const boatsPerBay = useAppStore((s) => s.project.params.boatsPerBay);
  const orientation = useAppStore((s) => s.project.params.orientation);
  return (
    <Section title={t('section.dock')}>
      <ParamField name="mainPierWidth" min={0.5} max={20} />
      <ParamField name="fingerWidth" min={0.1} max={5} />
      <ParamField name="fingerLengthRatio" min={0.1} max={1.5} step={0.05} />
      <div className="flex items-center justify-between gap-2 text-sm text-slate-700">
        <span id="boats-per-bay">{t('param.boatsPerBay')}</span>
        <div className="flex gap-1" role="group" aria-labelledby="boats-per-bay">
          {([1, 2] as const).map((n) => (
            <Button key={n} active={boatsPerBay === n} onClick={() => state().setParams({ boatsPerBay: n })}>
              {n}
            </Button>
          ))}
        </div>
      </div>
      <ParamField name="beamClearance" min={0} max={5} />
      <ParamField name="lengthClearance" min={0} max={5} />
      <ParamField name="shoreOffset" min={0} max={200} step={1} />
      <ParamField name="maxMainPierLength" min={5} max={1000} step={5} />
      <div className="flex items-center justify-between gap-2 text-sm text-slate-700">
        <span id="pier-direction">{t('param.orientation')}</span>
        <div className="flex gap-1" role="group" aria-labelledby="pier-direction">
          <Button active={orientation === 'auto'} onClick={() => state().setParams({ orientation: 'auto' })}>
            {t('param.orientationAuto')}
          </Button>
          <Button active={orientation !== 'auto'} onClick={() => orientation === 'auto' && state().setParams({ orientation: 0 })}>
            °
          </Button>
        </div>
      </div>
      {orientation !== 'auto' && (
        <NumberField label={t('param.orientationFixed')} value={orientation} min={0} max={360} step={5} onChange={(v) => state().setParams({ orientation: v }, { coalesce: 'param:orientation' })} />
      )}
      <p className="text-xs text-slate-500">{t('param.assumption')}</p>
    </Section>
  );
}

function FairwaySection() {
  const t = useT();
  return (
    <Section title={t('section.fairway')}>
      <ParamField name="fairwayFactor" min={0.5} max={5} />
      <ParamField name="fairwayMin" min={1} max={100} step={0.5} />
      <ParamField name="obstacleClearance" min={0} max={50} step={0.5} />
    </Section>
  );
}

function ObjectiveSection() {
  const t = useT();
  const objective = useAppStore((s) => s.project.objective);
  const setWeight = (key: keyof typeof objective.weights, value: number) =>
    state().setObjective({ weights: { ...objective.weights, [key]: value } }, { coalesce: `weight:${key}` });
  return (
    <Section title={t('section.objective')}>
      <div role="radiogroup" aria-label={t('section.objective')} className="space-y-0.5">
        {OBJECTIVES.map((id) => (
          <label key={id} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="objective" checked={objective.id === id} onChange={() => state().setObjective({ id })} />
            {t(`objective.${id}`)}
          </label>
        ))}
      </div>
      {objective.id === 'minInfrastructure' && (
        <NumberField label={t('objective.targetBerths')} value={objective.targetBerths} min={0} max={100000} step={1} onChange={(targetBerths) => state().setObjective({ targetBerths: Math.round(targetBerths) }, { coalesce: 'target' })} />
      )}
      {objective.id === 'balanced' && (
        <>
          <NumberField label={t('objective.weightCapacity')} value={objective.weights.capacity} min={0} max={100} onChange={(v) => setWeight('capacity', v)} />
          <NumberField label={t('objective.weightPontoon')} value={objective.weights.pontoon} min={0} max={100} onChange={(v) => setWeight('pontoon', v)} />
          <NumberField label={t('objective.weightFairway')} value={objective.weights.fairway} min={0} max={100} onChange={(v) => setWeight('fairway', v)} />
        </>
      )}
    </Section>
  );
}

function LayersSection() {
  const t = useT();
  const layers = useAppStore((s) => s.layers);
  return (
    <Section title={t('section.layers')} defaultOpen={false}>
      <div className="grid grid-cols-2 gap-x-2">
        {LAYER_IDS.map((id) => (
          <label key={id} className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" checked={layers[id]} onChange={() => state().toggleLayer(id)} />
            {t(`layer.${id}`)}
          </label>
        ))}
      </div>
    </Section>
  );
}

export function LeftSidebar() {
  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white" aria-label="Inputs">
      <ProjectSection />
      <SiteSection />
      <BackgroundSection />
      <BoatClassesSection />
      <DockSection />
      <FairwaySection />
      <ObjectiveSection />
      <LayersSection />
    </aside>
  );
}
