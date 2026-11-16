/** D52: the AS 3962-2001 advisory checks of a layout, with the inputs taken from the project. */
import { as3962Checks, type As3962Note } from '../engine/as3962';
import type { Layout, Project } from '../engine/model';
import { pierAxis } from '../engine/rows';
import { bearingOf, waveAssessment } from '../engine/waves';

export function as3962NotesFor(project: Project, layout: Layout, productFreeboard: number | null): As3962Note[] {
  const assessment = waveAssessment(project.waves, project.anchoring.depth, layout.piers.map((p) => ({ id: p.id, bearing: bearingOf(pierAxis(p).along) })));
  const waveHeight = (assessment?.sectors ?? []).flatMap((s) => s.events.filter((e) => e.event === 'oneYear').map((e) => e.waves.hm0)).reduce((a, b) => Math.max(a, b), 0);
  return as3962Checks({
    layout,
    site: project.site,
    params: project.params,
    classes: project.boatClasses,
    anchoring: project.anchoring,
    freeboard: productFreeboard ?? project.anchoring.pontoonFreeboard,
    waveHeight,
  });
}
