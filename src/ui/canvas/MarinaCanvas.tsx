/**
 * The drawing canvas (SPEC §8): site, selected layout, tools and overlays.
 *
 * World geometry is drawn inside one group that carries the view transform (metres →
 * pixels, y flipped so that north is up). Overlays that must keep their pixel size
 * (handles, labels, scale bar, disclaimer) are drawn in screen coordinates.
 */
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Shape, Stage, Text } from 'react-konva';
import { centroid, distance, dot, sub } from '../../engine/geometry';
import type { BackgroundImage, BoatClass, Layout, Polygon, Site, Vec2 } from '../../engine/model';
import { pierAxis } from '../../engine/rows';
import { pierPolygon } from '../../engine/site';
import { appStore, useAppStore, type LayerId, type Selection, type ToolId } from '../../state/store';
import { OSM_ATTRIBUTION } from '../../state/geo';
import { gridStep, panBy, scaleBar, screenToWorld, visibleBounds, worldToScreen, zoomAt, type Size, type View } from '../../state/view';
import { loadImage, registerStage } from '../export/download';
import { formatLength } from '../format';
import { deleteVertex, hasEntrance, insertVertex, moveVertex, normalizeSite, sitePaths } from '../tools/sitePaths';
import { siteSnapTargets, snapPoint } from '../tools/snap';
import { useCostModel } from '../costModel';
import { useT } from '../useT';
import { MapTiles } from './MapTiles';
import { hatchPatterns } from './patterns';

const COLORS = {
  water: '#e0f2fe',
  waterTranslucent: 'rgba(186, 230, 253, 0.35)',
  waterEdge: '#0369a1',
  shoreline: '#15803d',
  entrance: '#f59e0b',
  access: '#6b7280',
  chain: '#92400e',
  anchor: '#78350f',
  obstacle: '#1f2937',
  zoneEdge: '#dc2626',
  pier: '#374151',
  pierLocked: '#111827',
  finger: '#9ca3af',
  slot: '#64748b',
  issue: '#dc2626',
  selection: '#2563eb',
  draft: '#7c3aed',
  grid: '#e2e8f0',
  gridMajor: '#cbd5e1',
};

/** Pixels within which the cursor snaps to existing geometry. */
const SNAP_PIXELS = 10;
/** A press that moves less than this many pixels is a click, not a drag. */
const CLICK_PIXELS = 4;
/** Two clicks at the same place within this time are a double-click, ms. */
const DOUBLE_CLICK_MS = 350;
/** Pier drags are rounded to this step, m. */
const PIER_DRAG_STEP = 0.1;

/** A custom attribute of the node under the pointer (set as a prop on the shape). */
const attr = (node: unknown, name: string): unknown => (node as { attrs: Record<string, unknown> }).attrs[name];

const DRAWING_TOOLS: ToolId[] = ['water', 'shoreline', 'entrance', 'access', 'pier', 'obstacle', 'zone', 'measure', 'calibrate'];
const flat = (points: Vec2[]): number[] => points.flatMap((p) => [p.x, p.y]);

// ---------------------------------------------------------------------------
// World-space content (memoised: it does not re-render while panning or zooming)
// ---------------------------------------------------------------------------

interface SiteShapesProps {
  site: Site;
  layers: Record<LayerId, boolean>;
  /** Hatch tiles keep their pixel size, so their scale follows the zoom. */
  patternScale: number;
  /** Draw the water see-through so a background image stays visible under it. */
  translucent: boolean;
}

const SiteShapes = memo(function SiteShapes({ site, layers, patternScale, translucent }: SiteShapesProps) {
  const patterns = hatchPatterns();
  return (
    <>
      {layers.water && site.water.length >= 3 && (
        <Line points={flat(site.water)} closed fill={translucent ? COLORS.waterTranslucent : COLORS.water} stroke={COLORS.waterEdge} strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />
      )}
      {layers.zones &&
        site.zones.map((z) => (
          <Line
            key={z.id}
            points={flat(z.shape)}
            closed
            fillPatternImage={patterns.zone as unknown as HTMLImageElement}
            fillPatternScale={{ x: patternScale, y: patternScale }}
            stroke={COLORS.zoneEdge}
            strokeWidth={1.5}
            dash={[6, 4]}
            strokeScaleEnabled={false}
            listening={false}
          />
        ))}
      {layers.obstacles &&
        site.obstacles.map((o) => <Line key={o.id} points={flat(o.shape)} closed fill={COLORS.obstacle} listening={false} />)}
      {layers.shoreline && site.shoreline.length >= 2 && (
        <Line points={flat(site.shoreline)} stroke={COLORS.shoreline} strokeWidth={4} strokeScaleEnabled={false} lineCap="round" lineJoin="round" listening={false} />
      )}
      {layers.piers &&
        (site.accessPontoons ?? []).map((p) =>
          distance(p.start, p.end) > 0 ? (
            <Line
              key={p.id}
              points={flat(pierPolygon(p.start, p.end, p.width))}
              closed
              fill={COLORS.access}
              stroke={COLORS.pier}
              strokeWidth={1}
              dash={[4, 3]}
              strokeScaleEnabled={false}
              listening={false}
            />
          ) : null,
        )}
      {layers.shoreline && hasEntrance(site) && (
        <Line points={flat([site.entrance.a, site.entrance.b])} stroke={COLORS.entrance} strokeWidth={5} strokeScaleEnabled={false} lineCap="round" listening={false} />
      )}
    </>
  );
});

/** D23: chains (lines) and concrete anchors (squares, about 1.2 m) of the anchoring plan. */
function AnchorShapes() {
  const model = useCostModel();
  if (!model) return null;
  return (
    <>
      {model.anchoring.lines.map((l) => (
        <Line
          key={`${l.id}-chain`}
          points={flat([l.fix, l.anchor])}
          stroke={l.chainId ? COLORS.chain : COLORS.issue}
          strokeWidth={1}
          dash={[3, 2]}
          strokeScaleEnabled={false}
          listening={false}
        />
      ))}
      {model.anchoring.lines.map((l) => (
        <Rect
          key={`${l.id}-anchor`}
          x={l.anchor.x - 0.6}
          y={l.anchor.y - 0.6}
          width={1.2}
          height={1.2}
          fill={l.anchorCount > 1 ? COLORS.issue : COLORS.anchor}
          listening={false}
        />
      ))}
    </>
  );
}

interface LayoutShapesProps {
  layout: Layout;
  classes: BoatClass[];
  layers: Record<LayerId, boolean>;
  selection: Selection;
  patternScale: number;
}

const LayoutShapes = memo(function LayoutShapes({ layout, classes, layers, selection, patternScale }: LayoutShapesProps) {
  const patterns = hatchPatterns();
  const color = useMemo(() => new Map(classes.map((c) => [c.id, c.color])), [classes]);
  const flagged = useMemo(() => new Set(layout.issues.flatMap((i) => (i.elementId ? [i.elementId] : []))), [layout.issues]);
  return (
    <>
      {layers.fairways &&
        layout.fairways.map((f) => (
          <Shape
            key={f.id}
            listening={false}
            fillPatternImage={patterns.fairway as unknown as HTMLImageElement}
            fillPatternScale={{ x: patternScale, y: patternScale }}
            sceneFunc={(ctx, shape) => {
              // Outer ring counter-clockwise, holes clockwise: the default fill rule leaves the holes empty.
              ctx.beginPath();
              for (const ring of [f.shape, ...f.holes]) {
                ring.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
                ctx.closePath();
              }
              ctx.fillStrokeShape(shape);
            }}
          />
        ))}
      {layout.berths.map((b) => {
        const selected = selection?.kind === 'berth' && selection.id === b.id;
        const hasIssue = layers.issues && !b.removed && flagged.has(b.id);
        return (
          <Group key={b.id}>
            {(layers.slots || selected || hasIssue) && (
              <Line
                name="berth"
                id={b.id}
                points={flat(b.slot)}
                closed
                // A nearly transparent fill makes the whole slot clickable.
                fill="rgba(255,255,255,0.01)"
                stroke={selected ? COLORS.selection : hasIssue ? COLORS.issue : COLORS.slot}
                strokeWidth={selected ? 3 : hasIssue ? 2 : 1}
                {...(b.removed ? { dash: [4, 4] } : {})}
                opacity={b.removed && !selected ? 0.5 : 1}
                strokeScaleEnabled={false}
              />
            )}
            {layers.boats && !b.removed && (
              <Line points={flat(b.boat)} closed fill={color.get(b.boatClassId) ?? '#94a3b8'} listening={false} />
            )}
          </Group>
        );
      })}
      {layers.fingers && layout.fingers.map((f) => <Line key={f.id} points={flat(f.shape)} closed fill={COLORS.finger} listening={false} />)}
      {layers.piers &&
        layout.piers.map((p) => {
          const selected = selection?.kind === 'pier' && selection.id === p.id;
          const hasIssue = layers.issues && flagged.has(p.id);
          return (
            <Line
              key={p.id}
              name="pier"
              id={p.id}
              points={flat(pierPolygon(p.start, p.end, p.width))}
              closed
              fill={p.locked ? COLORS.pierLocked : COLORS.pier}
              {...(selected ? { stroke: COLORS.selection } : hasIssue ? { stroke: COLORS.issue } : {})}
              strokeWidth={selected ? 3 : 2}
              strokeScaleEnabled={false}
            />
          );
        })}
    </>
  );
});

function useBackgroundImage(background: BackgroundImage | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const url = background?.dataUrl ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setImage(null);
      return;
    }
    loadImage(url).then(
      (loaded) => !cancelled && setImage(loaded),
      () => !cancelled && setImage(null),
    );
    return () => {
      cancelled = true;
    };
  }, [url]);
  return image;
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

type Drag =
  | { kind: 'pan'; last: Vec2; moved: boolean }
  | { kind: 'press'; start: Vec2; last: Vec2; moved: boolean }
  | {
      kind: 'pier';
      layoutId: string;
      pierId: string;
      /** World position where the drag started. */
      origin: Vec2;
      start: Vec2;
      along: Vec2;
      left: Vec2;
      /** Chosen on the first real movement: along the pier axis or square to it. */
      mode: 'along' | 'lateral' | null;
      applied: number;
      moved: boolean;
    }
  | { kind: 'vertex'; key: string; index: number; start: Vec2; moved: boolean };

export function MarinaCanvas() {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const drag = useRef<Drag | null>(null);
  const spaceDown = useRef(false);
  const fitted = useRef(false);
  /** Time and place of the previous click, to recognise a double-click. */
  const lastClick = useRef<{ time: number; at: Vec2; tool: ToolId } | null>(null);

  const view = useAppStore((s) => s.view);
  const viewport = useAppStore((s) => s.viewport);
  const tool = useAppStore((s) => s.tool);
  const layers = useAppStore((s) => s.layers);
  const project = useAppStore((s) => s.project);
  const selectedLayoutId = useAppStore((s) => s.selectedLayoutId);
  const selection = useAppStore((s) => s.selection);
  const draft = useAppStore((s) => s.draft);
  const cursor = useAppStore((s) => s.cursor);
  const language = useAppStore((s) => s.language);

  const layout = project.layouts.find((l) => l.id === selectedLayoutId) ?? null;
  const backgroundImage = useBackgroundImage(project.background);
  // Rounded so that the memoised shapes re-render only on noticeable zoom changes.
  const zoomBucket = Math.round(Math.log2(view.zoom) * 8);
  const patternScale = useMemo(() => 1 / 2 ** (zoomBucket / 8), [zoomBucket]);

  // Keep the stage as large as its container.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => {
      const size = { width: Math.max(100, element.clientWidth), height: Math.max(100, element.clientHeight) };
      appStore.getState().setViewport(size);
      if (!fitted.current) {
        fitted.current = true;
        appStore.getState().fitView();
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    registerStage(stageRef.current);
    return () => registerStage(null);
  }, []);

  // Space + drag pans with any tool.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e)) {
        spaceDown.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const pointer = (): Vec2 => stageRef.current?.getPointerPosition() ?? { x: 0, y: 0 };
  const toWorld = (screen: Vec2): Vec2 => {
    const s = appStore.getState();
    return screenToWorld(s.view, s.viewport, screen);
  };
  /** World position of the pointer, snapped to the site geometry. */
  const snapped = (screen: Vec2, exclude?: { key: string; index: number }): Vec2 => {
    const s = appStore.getState();
    // An access pontoon lies off the wall on purpose; snapping would pull its centreline
    // onto the shoreline (D21).
    if (s.tool === 'access' || exclude?.key.startsWith('access:')) return toWorld(screen);
    const targets = siteSnapTargets(s.project.site, s.draft);
    if (exclude) {
      const own = sitePaths(s.project.site).find((p) => p.key === exclude.key)?.points[exclude.index];
      if (own) targets.vertices = targets.vertices.filter((v) => v !== own);
      // Do not hold a water vertex on the edges it is itself part of.
      if (exclude.key === 'water') targets.edges = [];
    }
    return snapPoint(toWorld(screen), targets, SNAP_PIXELS / s.view.zoom).point;
  };

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const s = appStore.getState();
    s.setView(zoomAt(s.view, s.viewport, pointer(), Math.exp(-e.evt.deltaY * 0.0015)));
  };

  const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const s = appStore.getState();
    const screen = pointer();
    const name = e.target.name();
    if (e.evt.button === 1 || spaceDown.current) {
      drag.current = { kind: 'pan', last: screen, moved: false };
      return;
    }
    if (e.evt.button !== 0) return;

    if (s.tool === 'select') {
      const active = s.project.layouts.find((l) => l.id === s.selectedLayoutId);
      if (name === 'pier' && active) {
        const pier = active.piers.find((p) => p.id === e.target.id());
        if (pier) {
          s.select({ kind: 'pier', id: pier.id });
          const { along, left } = pierAxis(pier);
          drag.current = pier.locked
            ? { kind: 'press', start: screen, last: screen, moved: false }
            : { kind: 'pier', layoutId: active.id, pierId: pier.id, origin: toWorld(screen), start: screen, along, left, mode: null, applied: 0, moved: false };
          return;
        }
      }
      if (name === 'berth') {
        s.select({ kind: 'berth', id: e.target.id() });
        drag.current = { kind: 'press', start: screen, last: screen, moved: false };
        return;
      }
      drag.current = { kind: 'pan', last: screen, moved: false };
      return;
    }

    if (s.tool === 'edit') {
      if (name === 'vertex' || name === 'midpoint') {
        const key = String(attr(e.target, 'pathKey'));
        let index = Number(attr(e.target, 'pointIndex'));
        if (name === 'midpoint') {
          // Dragging a midpoint inserts a new point there and continues as a point drag.
          const world = toWorld(screen);
          let inserted = index;
          s.updateSite(
            (site) => {
              const result = insertVertex(site, key, index, world);
              inserted = result.index;
              return result.site;
            },
            { coalesce: `vertex:${key}` },
          );
          index = inserted;
        }
        drag.current = { kind: 'vertex', key, index, start: screen, moved: false };
        return;
      }
      drag.current = { kind: 'pan', last: screen, moved: false };
      return;
    }

    // Drawing tools: a press may turn into a pan or stay a click.
    drag.current = { kind: 'press', start: screen, last: screen, moved: false };
  };

  const onMouseMove = () => {
    const s = appStore.getState();
    const screen = pointer();
    if (DRAWING_TOOLS.includes(s.tool)) s.setCursor(snapped(screen));
    const d = drag.current;
    if (!d) return;

    if (d.kind === 'pan' || d.kind === 'press') {
      const origin = d.kind === 'press' ? d.start : d.last;
      if (d.kind === 'press' && !d.moved && distance(screen, origin) < CLICK_PIXELS) return;
      d.moved = true;
      // A press with a drawing tool that turns into a drag pans the view.
      if (d.kind === 'press' && s.tool === 'select') return;
      s.setView(panBy(s.view, screen.x - d.last.x, screen.y - d.last.y));
      d.last = screen;
      return;
    }

    if (d.kind === 'pier') {
      if (!d.moved && distance(screen, d.start) < CLICK_PIXELS) return;
      d.moved = true;
      const total = sub(toWorld(screen), d.origin);
      const a = dot(total, d.along);
      const l = dot(total, d.left);
      d.mode ??= Math.abs(a) >= Math.abs(l) ? 'along' : 'lateral';
      const target = Math.round((d.mode === 'along' ? a : l) / PIER_DRAG_STEP) * PIER_DRAG_STEP;
      const step = target - d.applied;
      if (Math.abs(step) < 1e-9) return;
      const axis = d.mode === 'along' ? d.along : d.left;
      s.movePier(d.layoutId, d.pierId, { x: axis.x * step, y: axis.y * step }, { coalesce: `pier:${d.pierId}` });
      d.applied = target;
      return;
    }

    if (d.kind === 'vertex') {
      if (!d.moved && distance(screen, d.start) < CLICK_PIXELS) return;
      d.moved = true;
      const to = snapped(screen, { key: d.key, index: d.index });
      s.updateSite((site) => moveVertex(site, d.key, d.index, to), { coalesce: `vertex:${d.key}` });
    }
  };

  /**
   * Two clicks count as a double-click only when they are close in time AND place.
   * (Konva's own dblclick ignores the distance, so two quick clicks on different points
   * of a polygon would end the drawing.)
   */
  const isDoubleClick = (screen: Vec2): boolean => {
    const now = performance.now();
    const previous = lastClick.current;
    const currentTool = appStore.getState().tool;
    const double =
      previous !== null &&
      previous.tool === currentTool &&
      now - previous.time < DOUBLE_CLICK_MS &&
      distance(previous.at, screen) < CLICK_PIXELS;
    lastClick.current = double ? null : { time: now, at: screen, tool: currentTool };
    return double;
  };

  const onMouseUp = (e: KonvaEventObject<MouseEvent>) => {
    const s = appStore.getState();
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'pier') {
      s.endCoalescing();
      return;
    }
    if (d.kind === 'vertex') {
      if (d.moved) {
        s.updateSite(normalizeSite, { coalesce: `vertex:${d.key}` });
        s.endCoalescing();
      } else {
        s.endCoalescing();
        // Double-click on a point deletes it.
        if (isDoubleClick(pointer())) s.updateSite((site) => normalizeSite(deleteVertex(site, d.key, d.index)));
      }
      return;
    }
    if (d.moved) return;
    // A click.
    const screen = pointer();
    if (s.tool === 'select') {
      const name = e.target.name();
      if (name !== 'pier' && name !== 'berth') s.select(null);
    } else if (DRAWING_TOOLS.includes(s.tool) && e.evt.button === 0) {
      const double = isDoubleClick(screen);
      // The first click of a double-click has already added the point; the second finishes the shape.
      if (double && ['water', 'shoreline', 'obstacle', 'zone'].includes(s.tool)) s.finishDraft();
      else s.addDraftPoint(snapped(screen), SNAP_PIXELS / s.view.zoom);
    }
  };

  const onMouseLeave = () => {
    const d = drag.current;
    drag.current = null;
    const s = appStore.getState();
    if (d && (d.kind === 'pier' || d.kind === 'vertex')) s.endCoalescing();
    s.setCursor(null);
  };

  const toScreen = (p: Vec2): Vec2 => worldToScreen(view, viewport, p);
  const drawing = DRAWING_TOOLS.includes(tool);
  const rubberBand = cursor && draft.length > 0 ? [...draft, cursor] : draft;
  const isPolygonTool = tool === 'water' || tool === 'obstacle' || tool === 'zone';
  const measuring = tool === 'measure' || tool === 'calibrate';
  const measureEnd = measuring ? (draft.length >= 2 ? draft[1]! : draft.length === 1 ? cursor : null) : null;
  const paths = tool === 'edit' ? sitePaths(project.site) : [];
  const bar = scaleBar(view.zoom);
  const flaggedShapes: Polygon[] = [];
  if (layout && layers.issues) {
    const ids = new Set(layout.issues.flatMap((i) => (i.elementId ? [i.elementId] : [])));
    for (const p of layout.piers) if (ids.has(p.id)) flaggedShapes.push(pierPolygon(p.start, p.end, p.width));
    for (const b of layout.berths) if (!b.removed && ids.has(b.id)) flaggedShapes.push(b.slot);
  }

  return (
    <div
      ref={containerRef}
      data-testid="canvas"
      className="h-full w-full overflow-hidden bg-white"
      style={{ cursor: drawing ? 'crosshair' : tool === 'edit' ? 'default' : 'grab' }}
    >
      <Stage
        ref={stageRef}
        width={viewport.width}
        height={viewport.height}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <Layer listening={false}>
          <Rect x={0} y={0} width={viewport.width} height={viewport.height} fill="#ffffff" />
          {layers.grid && <Grid view={view} viewport={viewport} />}
        </Layer>

        <Layer>
          <Group
            x={viewport.width / 2 - view.cx * view.zoom}
            y={viewport.height / 2 + view.cy * view.zoom}
            scaleX={view.zoom}
            scaleY={-view.zoom}
          >
            {layers.background && project.map && <MapTiles map={project.map} view={view} viewport={viewport} />}
            {layers.background && project.background && backgroundImage && (
              <KonvaImage
                image={backgroundImage}
                x={project.background.origin.x}
                y={project.background.origin.y}
                width={backgroundImage.width * project.background.metresPerPixel}
                height={backgroundImage.height * project.background.metresPerPixel}
                // The group flips y; flip the image back, and turn clockwise on screen.
                scaleY={-1}
                rotation={-project.background.rotation}
                opacity={project.background.opacity}
                listening={false}
              />
            )}
            <SiteShapes
              site={project.site}
              layers={layers}
              patternScale={patternScale}
              translucent={layers.background && (project.background !== null || project.map !== null)}
            />
            {layout && (
              <LayoutShapes layout={layout} classes={project.boatClasses} layers={layers} selection={selection} patternScale={patternScale} />
            )}
            {layout && layers.anchoring && <AnchorShapes />}
          </Group>
        </Layer>

        <Layer>
          {/* Issue icons (SPEC §8: red outlines with an icon). */}
          {flaggedShapes.slice(0, 300).map((shape, i) => {
            const c = toScreen(centroid(shape));
            return <Text key={i} x={c.x - 6} y={c.y - 7} text="⚠" fontSize={13} fill={COLORS.issue} listening={false} />;
          })}

          {/* Pier labels. */}
          {layout &&
            layers.piers &&
            view.zoom >= 1.5 &&
            layout.piers.map((p) => {
              const c = toScreen(p.end);
              return <Text key={p.id} x={c.x + 6} y={c.y - 6} text={p.locked ? `${p.id} 🔒` : p.id} fontSize={11} fill="#0f172a" listening={false} />;
            })}

          {/* Shape being drawn. */}
          {drawing && rubberBand.length > 0 && !measuring && (
            <Line
              points={flat(rubberBand.map(toScreen))}
              closed={isPolygonTool && rubberBand.length >= 3}
              stroke={COLORS.draft}
              strokeWidth={2}
              dash={[6, 4]}
              {...(isPolygonTool ? { fill: 'rgba(124,58,237,0.08)' } : {})}
              listening={false}
            />
          )}
          {drawing &&
            draft.map((p, i) => {
              const c = toScreen(p);
              return <Circle key={i} x={c.x} y={c.y} radius={i === 0 && isPolygonTool ? 6 : 4} fill="#ffffff" stroke={COLORS.draft} strokeWidth={2} listening={false} />;
            })}
          {drawing && cursor && (
            <Circle x={toScreen(cursor).x} y={toScreen(cursor).y} radius={3} fill={COLORS.draft} listening={false} />
          )}

          {/* Measure and calibrate tools. */}
          {measuring && draft[0] && measureEnd && (
            <>
              <Line points={flat([draft[0], measureEnd].map(toScreen))} stroke={COLORS.draft} strokeWidth={2} listening={false} />
              <Text
                x={(toScreen(draft[0]).x + toScreen(measureEnd).x) / 2 + 8}
                y={(toScreen(draft[0]).y + toScreen(measureEnd).y) / 2 - 18}
                text={`${formatLength(distance(draft[0], measureEnd), language)} m`}
                fontSize={14}
                fontStyle="bold"
                fill={COLORS.draft}
                listening={false}
              />
            </>
          )}

          {/* Point handles of the edit tool. */}
          {paths.flatMap((path) => {
            const n = path.points.length;
            const handles = [];
            if (path.canInsert) {
              for (let i = 0; i < (path.closed ? n : n - 1); i++) {
                const a = toScreen(path.points[i]!);
                const b = toScreen(path.points[(i + 1) % n]!);
                if (distance(a, b) < 28) continue;
                handles.push(
                  <Circle key={`${path.key}-m${i}`} name="midpoint" pathKey={path.key} pointIndex={i} x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} radius={4} fill="#ffffff" stroke="#94a3b8" strokeWidth={1.5} />,
                );
              }
            }
            path.points.forEach((p, i) => {
              const c = toScreen(p);
              handles.push(
                <Circle key={`${path.key}-v${i}`} name="vertex" pathKey={path.key} pointIndex={i} x={c.x} y={c.y} radius={6} fill="#ffffff" stroke={COLORS.selection} strokeWidth={2} />,
              );
            });
            return handles;
          })}

          {/* Scale bar, north arrow and the disclaimer are part of the picture (and of the PNG export). */}
          <Group x={16} y={viewport.height - 44} listening={false}>
            <Rect x={-6} y={-18} width={bar.pixels + 12} height={30} fill="rgba(255,255,255,0.85)" cornerRadius={3} />
            <Line points={[0, 0, 0, 6, bar.pixels, 6, bar.pixels, 0]} stroke="#0f172a" strokeWidth={1.5} />
            <Text x={0} y={-15} text={`${bar.metres} m`} fontSize={12} fill="#0f172a" />
          </Group>
          <Group x={viewport.width - 34} y={18} listening={false}>
            <Line points={[0, 26, 0, 0]} stroke="#0f172a" strokeWidth={1.5} />
            <Line points={[-5, 8, 0, 0, 5, 8]} stroke="#0f172a" strokeWidth={1.5} />
            <Text x={-5} y={28} text="N" fontSize={12} fontStyle="bold" fill="#0f172a" />
          </Group>
          {layers.background && project.map && (
            // The map licence requires visible attribution, also in exported images.
            <Group x={viewport.width - 196} y={viewport.height - 34} listening={false}>
              <Rect x={0} y={0} width={190} height={16} fill="rgba(255,255,255,0.85)" cornerRadius={3} />
              <Text x={6} y={3} text={OSM_ATTRIBUTION} fontSize={11} fill="#0f172a" />
            </Group>
          )}
          <Group x={0} y={viewport.height - 16} listening={false}>
            <Rect x={0} y={-2} width={viewport.width} height={18} fill="rgba(255,251,235,0.92)" />
            <Text x={8} y={1} width={viewport.width - 16} text={t('app.disclaimer')} fontSize={11} fill="#78350f" wrap="none" ellipsis />
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}

function Grid({ view, viewport }: { view: View; viewport: Size }) {
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        const step = gridStep(view.zoom);
        const bounds = visibleBounds(view, viewport);
        const line = (a: Vec2, b: Vec2, major: boolean) => {
          const p = worldToScreen(view, viewport, a);
          const q = worldToScreen(view, viewport, b);
          ctx.beginPath();
          ctx.moveTo(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5);
          ctx.lineTo(Math.round(q.x) + 0.5, Math.round(q.y) + 0.5);
          ctx.strokeStyle = major ? COLORS.gridMajor : COLORS.grid;
          ctx.lineWidth = 1;
          ctx.stroke();
        };
        for (let i = Math.floor(bounds.minX / step); i * step <= bounds.maxX; i++) {
          line({ x: i * step, y: bounds.minY }, { x: i * step, y: bounds.maxY }, i % 5 === 0);
        }
        for (let j = Math.floor(bounds.minY / step); j * step <= bounds.maxY; j++) {
          line({ x: bounds.minX, y: j * step }, { x: bounds.maxX, y: j * step }, j % 5 === 0);
        }
      }}
    />
  );
}
