import { AnalysisRunError, analyzeImage } from './geminiService';
import { saveHistoryItem } from './storageService';
import { saveAnalysisResultFiles } from './resultFileService';
import type { AnalysisPipeline, AnalysisResumeState, AppSettings, CompareSideState } from '../types';
import { formatAnalysis } from '../utils/analysisFormat';

interface ComparisonSideOptions {
  apiKey: string;
  base64: string;
  mimeType: string;
  fileName: string | null;
  settings: AppSettings;
  pipeline: AnalysisPipeline;
  resumeState?: AnalysisResumeState | null;
}

interface ComparisonDependencies {
  analyze?: typeof analyzeImage;
  save?: typeof saveHistoryItem;
  saveFiles?: typeof saveAnalysisResultFiles;
}

export async function runComparisonSide(
  options: ComparisonSideOptions,
  dependencies: ComparisonDependencies = {},
): Promise<CompareSideState> {
  const analyze = dependencies.analyze ?? analyzeImage;
  const save = dependencies.save ?? saveHistoryItem;
  const saveFiles = dependencies.saveFiles ?? saveAnalysisResultFiles;
  try {
    const output = await analyze({
      apiKey: options.apiKey,
      base64: options.base64,
      mimeType: options.mimeType,
      model: options.settings.analysisModel,
      pipeline: options.pipeline,
      agenticVision: options.settings.agenticVision,
      resumeState: options.resumeState,
    });
    let historyId: string | null = null;
    let saveError: string | null = null;
    let autoSavePath: string | null = null;
    let autoSaveError: string | null = null;
    const [historyResult, fileResult] = await Promise.allSettled([
      save({
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
      }),
      saveFiles({
        pipeline: options.pipeline,
        output,
        references: [{ base64: options.base64, mimeType: options.mimeType, fileName: options.fileName }],
      }),
    ]);
    if (historyResult.status === 'fulfilled') {
      historyId = historyResult.value.id;
    } else {
      saveError = historyResult.reason instanceof Error ? historyResult.reason.message : '히스토리에 저장하지 못했습니다.';
    }
    if (fileResult.status === 'fulfilled') {
      autoSavePath = fileResult.value;
    } else {
      autoSaveError = fileResult.reason instanceof Error ? fileResult.reason.message : '결과 파일을 자동 저장하지 못했습니다.';
    }
    return { output, report: output.report, error: null, historyId, saveError, autoSavePath, autoSaveError, resumeState: null };
  } catch (error) {
    return {
      output: null,
      report: error instanceof AnalysisRunError ? error.report : null,
      error: error instanceof Error ? error.message : '비교 분석에 실패했습니다.',
      historyId: null,
      saveError: null,
      autoSavePath: null,
      autoSaveError: null,
      resumeState: error instanceof AnalysisRunError ? error.resumeState : null,
    };
  }
}
