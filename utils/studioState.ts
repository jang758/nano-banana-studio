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
    resumeState: null,
  };
}

export function createPipelineSession(): PipelineWorkspaceSession {
  return { slots: [createWorkspaceSlot()], activeSlotId: null };
}

export function createCompareSideState(): CompareSideState {
  return { output: null, report: null, error: null, historyId: null, saveError: null, resumeState: null };
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
  return [...byId.values()].sort((a, b) => {
    const taskOrder = { analysis: 0, image: 1, specialized: 2 };
    const sourceOrder = { custom: 0, api: 1, default: 2 };
    return taskOrder[a.task] - taskOrder[b.task]
      || sourceOrder[a.source] - sourceOrder[b.source]
      || a.displayName.localeCompare(b.displayName);
  });
}

export function normalizeModelId(value: string): string {
  const id = value.trim().replace(/^models\//i, '');
  if (!id) throw new Error('Custom Model ID를 입력해 주세요.');
  if (!/^gemini-[a-z0-9][a-z0-9._-]*$/i.test(id)) {
    throw new Error('Custom Model은 gemini-로 시작하는 유효한 모델 ID여야 합니다.');
  }
  return id;
}

export function createCustomModel(value: string): ModelOption {
  const id = normalizeModelId(value);
  return {
    id,
    displayName: 'Custom Model',
    description: '사용자가 직접 지정한 이미지 분석 모델',
    supportedActions: ['generateContent'],
    task: 'analysis',
    selectable: true,
    source: 'custom',
  };
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
