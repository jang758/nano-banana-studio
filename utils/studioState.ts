import { DEFAULT_SETTINGS, FALLBACK_MODELS } from '../constants';
import type {
  AppSettings,
  CompareSession,
  CompareSideState,
  ModelOption,
  PipelineWorkspaceSession,
  StudioView,
  WorkspaceSlot,
} from '../types';

export function createWorkspaceSlot(): WorkspaceSlot {
  return {
    id: crypto.randomUUID(),
    originalImage: null,
    originalMimeType: null,
    generatedImage: null,
    generatedMimeType: null,
    analysisText: '',
    analysisLang: 'en',
    currentPrompt: '',
    promptLang: 'en',
    status: 'idle',
    error: null,
    rawAnalysis: null,
    trace: null,
    report: null,
    savedHistoryId: null,
  };
}

export function createPipelineSession(): PipelineWorkspaceSession {
  return { slots: [createWorkspaceSlot()], activeSlotId: null };
}

export function createCompareSideState(): CompareSideState {
  return { output: null, report: null, error: null, historyId: null, saveError: null };
}

export function createCompareSession(): CompareSession {
  return {
    image: null,
    standard: createCompareSideState(),
    harness: createCompareSideState(),
    error: null,
  };
}

export function createSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS };
}

export function mergeModels(liveModels: ModelOption[]): ModelOption[] {
  const byId = new Map<string, ModelOption>();
  FALLBACK_MODELS.forEach((model) => byId.set(model.id, model));
  liveModels.forEach((model) => byId.set(model.id, model));
  return [...byId.values()].sort((a, b) => a.task.localeCompare(b.task) || a.displayName.localeCompare(b.displayName));
}

export function studioViewFromPath(pathname: string): StudioView {
  if (pathname.endsWith('/harness.html')) return 'harness';
  if (pathname.endsWith('/compare.html')) return 'compare';
  return 'standard';
}

export function pathForStudioView(view: StudioView): string {
  if (view === 'harness') return '/harness.html';
  if (view === 'compare') return '/compare.html';
  return '/';
}
