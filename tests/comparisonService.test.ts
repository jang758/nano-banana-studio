import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants';
import { runComparisonSide } from '../services/comparisonService';
import { AnalysisRunError, analyzeImage } from '../services/geminiService';
import { saveHistoryItem } from '../services/storageService';
import type { AnalysisOutput, AnalysisReport, AnalysisResult } from '../types';

const result: AnalysisResult = {
  face: 'face', expression: 'expression', body: 'body', fashion: 'fashion', pose: 'pose', skin: 'skin',
  lighting: 'lighting', camera: 'camera', background: 'background', effects: 'effects', interaction: 'interaction',
  face_ko: '얼굴', expression_ko: '표정', body_ko: '신체', fashion_ko: '의상', pose_ko: '자세', skin_ko: '피부',
  lighting_ko: '조명', camera_ko: '카메라', background_ko: '배경', effects_ko: '효과', interaction_ko: '상호작용',
  prompt_en: 'English prompt', prompt_ko: '한국어 프롬프트',
};

const report = (pipeline: 'standard' | 'harness', outcome: 'completed' | 'failed'): AnalysisReport => ({
  reportVersion: 1,
  createdAt: 1,
  outcome,
  pipeline,
  requestedModel: 'gemini-pro-latest',
  resolvedModels: outcome === 'completed' ? ['gemini-pro-latest'] : [],
  agenticVisionRequested: false,
  agenticVisionStatus: 'DISABLED',
  inspections: [],
  stages: [],
  usage: { inputTokens: 0, outputTokens: 0, thoughtTokens: 0, toolUseTokens: 0, cachedTokens: 0, totalTokens: 0 },
  cost: { currency: 'USD', totalUsd: null, agenticAttributedUsd: null, pricingModel: null, pricingAsOf: '2026-07-21', note: 'test' },
  totalDurationMs: 1,
  ...(outcome === 'failed' ? { failure: { stage: 'test', reason: 'standard failed', category: 'unknown' as const } } : { finalAnalysis: result }),
});

const harnessOutput: AnalysisOutput = {
  result,
  trace: { pipeline: 'harness', agenticVisionStatus: 'DISABLED', stages: [], totalDurationMs: 1 },
  report: report('harness', 'completed'),
};

describe('runComparisonSide', () => {
  it('returns each side independently so one failure does not discard the other success', async () => {
    const analyze = (async (options: Parameters<typeof analyzeImage>[0]) => {
      if (options.pipeline === 'standard') throw new AnalysisRunError('standard failed', report('standard', 'failed'));
      return harnessOutput;
    }) as typeof analyzeImage;
    const save: typeof saveHistoryItem = async (input) => ({
      id: 'harness-history-id',
      timestamp: 1,
      title: 'test',
      promptUsed: input.promptUsed,
      pipeline: input.pipeline,
      type: input.type,
      searchText: 'test',
    });
    const common = { apiKey: 'test', base64: 'image', mimeType: 'image/png', settings: DEFAULT_SETTINGS };

    const [standard, harness] = await Promise.all([
      runComparisonSide({ ...common, pipeline: 'standard' }, { analyze, save }),
      runComparisonSide({ ...common, pipeline: 'harness' }, { analyze, save }),
    ]);

    expect(standard.output).toBeNull();
    expect(standard.report?.outcome).toBe('failed');
    expect(harness.output).toBe(harnessOutput);
    expect(harness.historyId).toBe('harness-history-id');
  });
});
