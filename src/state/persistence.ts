/**
 * Autosave of the current project in the browser's localStorage (SPEC §2).
 */
import type { Project } from '../engine/model';
import { parseProject, serializeProject } from './projectFile';

export const STORAGE_KEY = 'marina-layout-planner:project';

/** The part of the Web Storage API that is used; lets tests pass a fake. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type SaveOutcome = 'saved' | 'savedWithoutBackground' | 'failed';

/**
 * Save the project. localStorage has a small quota and a background image can exceed it;
 * in that case the project is saved without the image so that the drawing is not lost.
 */
export function saveProjectToStorage(project: Project, storage: StorageLike): SaveOutcome {
  try {
    storage.setItem(STORAGE_KEY, serializeProject(project));
    return 'saved';
  } catch {
    if (project.background === null) return 'failed';
  }
  try {
    storage.setItem(STORAGE_KEY, serializeProject({ ...project, background: null }));
    return 'savedWithoutBackground';
  } catch {
    return 'failed';
  }
}

/** The saved project, or null when there is none or it cannot be read. */
export function loadProjectFromStorage(storage: StorageLike): Project | null {
  let text: string | null;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (text === null) return null;
  const parsed = parseProject(text);
  return parsed.ok ? parsed.project : null;
}

/** The browser's localStorage, or null where it is unavailable (private mode, tests). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
