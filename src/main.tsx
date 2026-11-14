import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import priceListUrl from '../data/hinnasto.xlsx?url';
import { parsePriceListFile } from './catalog/priceList';
import { translate } from './i18n';
import { browserStorage, loadProjectFromStorage, saveProjectToStorage } from './state/persistence';
import { appStore } from './state/store';
import { AppShell } from './ui/App';
import { MarinaCanvas } from './ui/canvas/MarinaCanvas';
import './index.css';

/** Restore the autosaved project and keep saving changes (SPEC §2). */
function startAutosave(): void {
  const storage = browserStorage();
  if (!storage) return;
  const saved = loadProjectFromStorage(storage);
  if (saved) appStore.getState().replaceProject(saved);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let warned = false;
  appStore.subscribe((state, previous) => {
    if (state.project === previous.project) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const outcome = saveProjectToStorage(appStore.getState().project, storage);
      if (outcome === 'saved') {
        warned = false;
      } else if (!warned) {
        // Shown once per run of failures, not on every change.
        warned = true;
        const { language, setNotice } = appStore.getState();
        setNotice(translate(language, outcome === 'failed' ? 'notice.storageFailed' : 'notice.savedWithoutBackground'));
      }
    }, 400);
  });
}

startAutosave();

/** Load the built-in price list (data/hinnasto.xlsx, D19); the cost panels wait for it. */
async function loadPriceList(): Promise<void> {
  try {
    const response = await fetch(priceListUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = parsePriceListFile(new Uint8Array(await response.arrayBuffer()), 'hinnasto.xlsx');
    if (result.ok) appStore.getState().setBuiltInPriceList(result.priceList);
    else appStore.getState().setBuiltInPriceList(null, result.errors.slice(0, 3).join(' '));
  } catch (error) {
    appStore.getState().setBuiltInPriceList(null, error instanceof Error ? error.message : String(error));
  }
}
void loadPriceList();

// Debugging aid, also used by the end-to-end test: the store is reachable from the console.
(window as unknown as { __marina: typeof appStore }).__marina = appStore;

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <AppShell canvas={<MarinaCanvas />} />
  </StrictMode>,
);
