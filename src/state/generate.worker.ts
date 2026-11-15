/**
 * Web Worker that runs the layout generator off the main thread (U23), so the page keeps
 * responding while alternatives are computed. Input and output are plain JSON (SPEC §2).
 */
import { generateLayouts, type GenerateInput } from '../engine/generate';

interface Request {
  id: number;
  input: GenerateInput;
}

const scope = self as unknown as { onmessage: ((e: MessageEvent<Request>) => void) | null; postMessage(message: unknown): void };

scope.onmessage = (e) => {
  const { id, input } = e.data;
  try {
    scope.postMessage({ id, result: generateLayouts(input) });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
