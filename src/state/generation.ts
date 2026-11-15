/**
 * Runs the generator in a Web Worker when the platform has one (U23); otherwise (tests in
 * Node) on the calling thread, synchronously. Only one run at a time: a new run or `cancel`
 * stops the one before.
 */
import { generateLayouts, type GenerateInput, type GenerateResult } from '../engine/generate';

export interface GenerationRun {
  /** Resolves with the result; rejects if the worker fails. Never settles when cancelled. */
  result: Promise<GenerateResult>;
  cancel(): void;
}

let worker: Worker | null = null;
/** Whether `worker` is computing; a new run then needs a fresh worker. */
let busy = false;
let nextId = 1;

// Node (the tests) has no global Worker, and jsdom does not implement one.
const canUseWorker = (): boolean => typeof Worker !== 'undefined' && typeof window !== 'undefined';

/** The idle worker, or a new one (an old busy one is stopped: only one run at a time). */
function idleWorker(): Worker {
  if (worker && !busy) return worker;
  worker?.terminate();
  worker = new Worker(new URL('./generate.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/** True when `startGeneration` returns before the result is known. */
export const generationIsAsync = canUseWorker;

export function startGeneration(input: GenerateInput): GenerationRun {
  if (!canUseWorker()) {
    const result = generateLayouts(input);
    return { result: Promise.resolve(result), cancel: () => {} };
  }
  const w = idleWorker();
  busy = true;
  const id = nextId++;
  let cancelled = false;
  const result = new Promise<GenerateResult>((resolve, reject) => {
    w.onmessage = (e: MessageEvent<{ id: number; result?: GenerateResult; error?: string }>) => {
      if (cancelled || e.data.id !== id) return;
      busy = false;
      if (e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error ?? 'Generation failed'));
    };
    w.onerror = (e) => {
      if (cancelled) return;
      // A failed worker is not reused.
      w.terminate();
      if (worker === w) worker = null;
      busy = false;
      reject(new Error(e.message || 'Generation failed'));
    };
  });
  // JSON round trip: the worker gets plain data only.
  w.postMessage({ id, input: JSON.parse(JSON.stringify(input)) as GenerateInput });
  return {
    result,
    cancel: () => {
      cancelled = true;
      if (worker === w && busy) {
        w.terminate();
        worker = null;
        busy = false;
      }
    },
  };
}
