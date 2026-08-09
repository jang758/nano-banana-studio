import { AnalysisRunError, analyzeImage } from './geminiService';
import { saveHistoryItem } from './storageService';
import type { AnalysisPipeline, AppSettings, CompareSideState } from '../types';
import { formatAnalysis } from '../utils/analysisFormat';

interface ComparisonSideOptions {
  apiKey: string;
  base64: string;
  mimeType: string;
  settings: AppSettings;
  pipeline: AnalysisPipeline;
}

interface ComparisonDependencies {
  analyze?: typeof analyzeImage;
  save?: typeof saveHistoryItem;
}

export async function runComparisonSide(
  options: ComparisonSideOptions,
  dependencies: ComparisonDependencies = {},
): Promise<CompareSideState> {
  const analyze = dependencies.analyze ?? analyzeImage;
  const save = dependencies.save ?? saveHistoryItem;
  try {
    const output = await analyze({
      apiKey: options.apiKey,
      base64: options.base64,
      mimeType: options.mimeType,
      model: options.settings.analysisModel,
      pipeline: options.pipeline,
      agenticVision: options.settings.agenticVision,
    });
    let historyId: string | null = null;
    let saveError: string | null = null;
    try {
      const saved = await save({
        originalImage: options.base64,
        originalMimeType: options.mimeType,
        generatedImage: null,
        generatedMimeType: null,
        promptUsed: output.result.prompt_en,
        analysis: output.result,
        analysisText: formatAnalysis(output.result, 'en'),
        analysisLang: 'en',
        promptLang: 'en',
        trace: output.trace,
        report: output.report,
        settings: { ...options.settings },
        pipeline: options.pipeline,
        type: 'analysis',
      });
      historyId = saved.id;
    } catch (error) {
      saveError = error instanceof Error ? error.message : '히스토리에 저장하지 못했습니다.';
    }
    return { output, report: output.report, error: null, historyId, saveError };
  } catch (error) {
    return {
      output: null,
      report: error instanceof AnalysisRunError ? error.report : null,
      error: error instanceof Error ? error.message : '비교 분석에 실패했습니다.',
      historyId: null,
      saveError: null,
    };
  }
}
