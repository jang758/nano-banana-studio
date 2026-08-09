import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import {
  ANALYSIS_SYSTEM_INSTRUCTION,
  HARNESS_CRITIC_INSTRUCTION,
  HARNESS_EVIDENCE_INSTRUCTION,
  HARNESS_SYNTHESIS_INSTRUCTION,
  STANDARD_ANALYSIS_REQUEST,
} from '../constants';
import type {
  AgenticVisionStatus,
  AgenticInspection,
  AnalysisOutput,
  AnalysisPipeline,
  AnalysisReport,
  AnalysisResult,
  AnalysisStageReport,
  AppSettings,
  HarnessCritique,
  HarnessEvidence,
  ModelOption,
  TokenUsageSummary,
} from '../types';
import { addUsage, estimateCost } from '../utils/analysisReport';

const analysisShape = {
  face: z.string(),
  expression: z.string(),
  body: z.string(),
  fashion: z.string(),
  pose: z.string(),
  skin: z.string(),
  lighting: z.string(),
  camera: z.string(),
  background: z.string(),
  effects: z.string(),
  interaction: z.string(),
  face_ko: z.string(),
  expression_ko: z.string(),
  body_ko: z.string(),
  fashion_ko: z.string(),
  pose_ko: z.string(),
  skin_ko: z.string(),
  lighting_ko: z.string(),
  camera_ko: z.string(),
  background_ko: z.string(),
  effects_ko: z.string(),
  interaction_ko: z.string(),
  prompt_en: z.string(),
  prompt_ko: z.string(),
};

export const analysisResultSchema = z.object(analysisShape).strict();

const harnessEvidenceSchema = z.object({
  composition: z.string(),
  subjects: z.array(z.string()),
  visible_contacts: z.array(z.string()),
  pose_and_support: z.array(z.string()),
  materials_and_surface: z.array(z.string()),
  lighting_and_camera: z.array(z.string()),
  uncertainties: z.array(z.string()),
}).strict();

const harnessCritiqueSchema = z.object({
  accepted: z.array(z.string()),
  corrections: z.array(z.string()),
  unsupported_claims: z.array(z.string()),
  synthesis_rules: z.array(z.string()),
}).strict();

const stringProperty = (description?: string) => ({
  type: 'string',
  ...(description ? { description } : {}),
});

// 기존 분석 버전의 속성, 설명, required 목록을 그대로 유지한다.
export const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    face: stringProperty('Detailed anatomical facial mapping and feature distances.'),
    expression: stringProperty('Physiological micro-expression and facial tension data.'),
    body: stringProperty('Precise measurements (B-W-H, height, weight, WHR, limb ratios). Include global orientation relative to camera.'),
    fashion: stringProperty('Material weight (GSM), tension points, and exact HEX colors.'),
    pose: stringProperty('Geometric joint angles. Strictly distinguish between standing, sitting, prone, and supine.'),
    skin: stringProperty('Elasticity coefficient, Ptosis level, skin tone HEX, and SSS depth.'),
    lighting: stringProperty('Photometric source intensity, Kelvin, and contrast ratios.'),
    camera: stringProperty('Focal length, F-stop, and lens-to-subject orientation angle.'),
    background: stringProperty('Environment depth in meters and geometric layout.'),
    effects: stringProperty('Color grading LUTs, grain size, and optical aberrations.'),
    interaction: stringProperty('Extreme anatomical detail on character-to-character physical contact. Identify specific bone/muscle areas being touched, weight distribution vectors, and how bodies are overlapping or mounting.'),
    face_ko: stringProperty(),
    expression_ko: stringProperty(),
    body_ko: stringProperty(),
    fashion_ko: stringProperty(),
    pose_ko: stringProperty(),
    skin_ko: stringProperty(),
    lighting_ko: stringProperty(),
    camera_ko: stringProperty(),
    background_ko: stringProperty(),
    effects_ko: stringProperty(),
    interaction_ko: stringProperty(),
    prompt_en: stringProperty('Must start with view orientation AND detailed physical composition involving all characters with specific contact descriptions.'),
    prompt_ko: stringProperty(),
  },
  required: [
    'face', 'face_ko',
    'expression', 'expression_ko',
    'body', 'body_ko',
    'fashion', 'fashion_ko',
    'pose', 'pose_ko',
    'skin', 'skin_ko',
    'lighting', 'lighting_ko',
    'camera', 'camera_ko',
    'background', 'background_ko',
    'effects', 'effects_ko',
    'interaction', 'interaction_ko',
    'prompt_en', 'prompt_ko',
  ],
  additionalProperties: false,
};

const EVIDENCE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    composition: stringProperty(),
    subjects: { type: 'array', items: stringProperty() },
    visible_contacts: { type: 'array', items: stringProperty() },
    pose_and_support: { type: 'array', items: stringProperty() },
    materials_and_surface: { type: 'array', items: stringProperty() },
    lighting_and_camera: { type: 'array', items: stringProperty() },
    uncertainties: { type: 'array', items: stringProperty() },
  },
  required: ['composition', 'subjects', 'visible_contacts', 'pose_and_support', 'materials_and_surface', 'lighting_and_camera', 'uncertainties'],
  additionalProperties: false,
};

const CRITIQUE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    accepted: { type: 'array', items: stringProperty() },
    corrections: { type: 'array', items: stringProperty() },
    unsupported_claims: { type: 'array', items: stringProperty() },
    synthesis_rules: { type: 'array', items: stringProperty() },
  },
  required: ['accepted', 'corrections', 'unsupported_claims', 'synthesis_rules'],
  additionalProperties: false,
};

export const SAFETY_SETTINGS = [
  { type: 'harassment', threshold: 'off' },
  { type: 'hate_speech', threshold: 'off' },
  { type: 'sexually_explicit', threshold: 'off' },
  { type: 'dangerous_content', threshold: 'off' },
];

const imageInput = (base64: string, mimeType: string) => ({
  type: 'image' as const,
  data: base64,
  mime_type: mimeType,
});

const jsonFormat = (schema: Record<string, unknown>) => ({
  type: 'text' as const,
  mime_type: 'application/json' as const,
  schema,
});

function createClient(apiKey: string): GoogleGenAI {
  const key = apiKey.trim();
  if (!key) throw new Error('API 키를 먼저 입력해 주세요. 키는 현재 실행 중인 메모리에만 보관됩니다.');
  return new GoogleGenAI({ apiKey: key });
}

function parseJson<T>(text: string | undefined, schema: z.ZodType<T>, stage: string): T {
  if (!text) throw new Error(`${stage} 응답이 비어 있습니다.`);
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    throw new Error(`${stage} 응답이 올바른 JSON이 아닙니다.`);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`${stage} 응답이 요구 스키마와 일치하지 않습니다.`);
  return parsed.data;
}

function isAgenticUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /code.?execution|tool.+not supported|unsupported.+tool|invalid tool/i.test(message);
}

function publicApiError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/api.?key|unauthenticated|permission|401|403/i.test(message)) {
    return new Error('API 키가 유효하지 않거나 이 모델에 대한 권한이 없습니다.');
  }
  if (/quota|resource.?exhausted|429/i.test(message)) {
    return new Error('Gemini API 할당량을 초과했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (/not found|404|model/i.test(message) && /not found|404/i.test(message)) {
    return new Error('선택한 모델을 현재 API 키에서 사용할 수 없습니다. 모델 목록을 새로고침해 주세요.');
  }
  const redacted = message
    .replace(/AIza[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]');
  return new Error(redacted || 'Gemini API 요청에 실패했습니다.');
}

type FailureCategory = NonNullable<AnalysisReport['failure']>['category'];

function failureCategory(message: string): FailureCategory {
  if (/api 키|api.?key|unauthenticated|permission|401|403/i.test(message)) return 'authentication';
  if (/quota|할당량|resource.?exhausted|429/i.test(message)) return 'quota';
  if (/model|모델|not found|404/i.test(message)) return 'model';
  if (/safety|blocked|refus|거절|policy|prohibited/i.test(message)) return 'safety';
  if (/schema|json|스키마/i.test(message)) return 'schema';
  if (/code.?execution|tool|도구/i.test(message)) return 'tool';
  if (/network|fetch|timeout|연결/i.test(message)) return 'network';
  return 'unknown';
}

function readAgenticStatus(steps: Array<{ type?: string; is_error?: boolean }> | undefined): AgenticVisionStatus {
  const call = steps?.some((step) => step.type === 'code_execution_call') ?? false;
  const results = steps?.filter((step) => step.type === 'code_execution_result') ?? [];
  if (!call) return 'AVAILABLE_NOT_USED';
  if (results.some((step) => step.is_error)) return 'USED_FAILED';
  return results.length > 0 ? 'USED_OK' : 'USED_FAILED';
}

interface InteractionUsage {
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_thought_tokens?: number;
  total_tool_use_tokens?: number;
  total_cached_tokens?: number;
  total_tokens?: number;
}

interface InteractionStep {
  type?: string;
  id?: string;
  call_id?: string;
  is_error?: boolean;
  arguments?: { code?: string; language?: string };
  result?: string;
  error?: { message?: string };
}

interface InteractionResponse {
  output_text?: string;
  output_image?: { data?: string; mime_type?: string };
  steps?: InteractionStep[];
  model?: string;
  status?: string;
  usage?: InteractionUsage;
}

function usageFromResponse(response: InteractionResponse): TokenUsageSummary {
  return {
    inputTokens: response.usage?.total_input_tokens ?? 0,
    outputTokens: response.usage?.total_output_tokens ?? 0,
    thoughtTokens: response.usage?.total_thought_tokens ?? 0,
    toolUseTokens: response.usage?.total_tool_use_tokens ?? 0,
    cachedTokens: response.usage?.total_cached_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
  };
}

function clipped(value: string | undefined, length = 800): string {
  if (!value) return '';
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

function inspectionArea(code: string): string {
  const crop = code.match(/crop\s*\(\s*\(?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (crop) return `이미지 좌표 (${crop[1]}, ${crop[2]})–(${crop[3]}, ${crop[4]})`;
  const slice = code.match(/\[\s*(\d+)\s*:\s*(\d+)\s*,\s*(\d+)\s*:\s*(\d+)\s*\]/);
  if (slice) return `배열 영역 y ${slice[1]}–${slice[2]}, x ${slice[3]}–${slice[4]}`;
  if (/zoom|resize|thumbnail/i.test(code)) return '확대 또는 리사이즈한 영역(좌표는 실행 기록에 없음)';
  return '전체 이미지 또는 좌표가 명시되지 않은 영역';
}

function inspectionPurpose(code: string): string {
  const comment = code.split('\n').map((line) => line.trim()).find((line) => line.startsWith('#'));
  if (comment) return clipped(comment.replace(/^#+\s*/, ''), 220);
  const printText = code.match(/print\s*\(\s*["']([^"']+)["']/i)?.[1];
  return clipped(printText, 220) || '모델이 필요하다고 판단한 확대·좌표·픽셀 확인';
}

function inspectionsFromResponse(response: InteractionResponse): AgenticInspection[] {
  const calls = response.steps?.filter((step) => step.type === 'code_execution_call') ?? [];
  const results = response.steps?.filter((step) => step.type === 'code_execution_result') ?? [];
  return calls.map((call, index) => {
    const code = call.arguments?.code ?? '';
    const result = results.find((candidate) => candidate.call_id === call.id) ?? results[index];
    return {
      index: index + 1,
      area: inspectionArea(code),
      purpose: inspectionPurpose(code),
      codeExcerpt: clipped(code),
      resultExcerpt: clipped(result?.result),
      status: result ? (result.is_error ? 'failed' : 'ok') : 'unknown',
    };
  });
}

function assertInteractionCompleted(response: InteractionResponse, stage: string): void {
  const stepError = response.steps?.find((step) => step.error?.message)?.error?.message;
  if (stepError) throw new Error(`${stage} 모델 오류: ${stepError}`);
  if (response.status && response.status !== 'completed') {
    throw new Error(`${stage} 요청이 완료되지 않았습니다. API 상태: ${response.status}`);
  }
}

function stageReport(
  name: string,
  requestedModel: string,
  response: InteractionResponse,
  durationMs: number,
  agenticVisionStatus: AgenticVisionStatus,
): AnalysisStageReport {
  return {
    name,
    requestedModel,
    resolvedModel: response.model || requestedModel,
    durationMs,
    status: response.status || 'completed',
    usage: usageFromResponse(response),
    agenticVisionStatus,
    inspections: inspectionsFromResponse(response),
  };
}

function completedReport(options: {
  pipeline: AnalysisPipeline;
  requestedModel: string;
  agenticVisionRequested: boolean;
  agenticVisionStatus: AgenticVisionStatus;
  stages: AnalysisStageReport[];
  totalDurationMs: number;
  result: AnalysisResult;
}): AnalysisReport {
  const inspections = options.stages.flatMap((stage) => stage.inspections);
  const usage = addUsage(options.stages.map((stage) => stage.usage));
  return {
    reportVersion: 1,
    createdAt: Date.now(),
    outcome: 'completed',
    pipeline: options.pipeline,
    requestedModel: options.requestedModel,
    resolvedModels: [...new Set(options.stages.map((stage) => stage.resolvedModel))],
    agenticVisionRequested: options.agenticVisionRequested,
    agenticVisionStatus: options.agenticVisionStatus,
    inspections,
    stages: options.stages,
    usage,
    cost: estimateCost(options.stages),
    totalDurationMs: options.totalDurationMs,
    finalAnalysis: options.result,
  };
}

export class AnalysisRunError extends Error {
  readonly report: AnalysisReport;

  constructor(message: string, report: AnalysisReport) {
    super(message);
    this.name = 'AnalysisRunError';
    this.report = report;
  }
}

interface RunTracker {
  stage: string;
  stages: AnalysisStageReport[];
  agenticVisionStatus: AgenticVisionStatus;
}

async function interactionWithOptionalVision(
  ai: GoogleGenAI,
  request: Record<string, unknown>,
  enabled: boolean,
): Promise<{ response: InteractionResponse; status: AgenticVisionStatus }> {
  if (!enabled) {
    const response = await ai.interactions.create(request as never) as InteractionResponse;
    return { response, status: 'DISABLED' };
  }

  try {
    const response = await ai.interactions.create({
      ...request,
      tools: [{ type: 'code_execution' }],
      generation_config: {
        ...((request.generation_config as Record<string, unknown> | undefined) ?? {}),
        thinking_level: 'high',
        tool_choice: 'auto',
      },
    } as never) as InteractionResponse;
    return {
      response,
      status: readAgenticStatus(response.steps),
    };
  } catch (error) {
    if (!isAgenticUnsupported(error)) throw error;
    const response = await ai.interactions.create(request as never) as InteractionResponse;
    return { response, status: 'UNSUPPORTED' };
  }
}

async function analyzeStandard(
  ai: GoogleGenAI,
  base64: string,
  mimeType: string,
  model: string,
  agenticVision: boolean,
  tracker: RunTracker,
): Promise<AnalysisOutput> {
  const started = performance.now();
  tracker.stage = '기존 1회 분석';
  const callStarted = performance.now();
  const { response, status } = await interactionWithOptionalVision(ai, {
    model,
    store: false,
    system_instruction: ANALYSIS_SYSTEM_INSTRUCTION,
    input: [imageInput(base64, mimeType), { type: 'text', text: STANDARD_ANALYSIS_REQUEST }],
    response_format: jsonFormat(ANALYSIS_JSON_SCHEMA),
    safety_settings: SAFETY_SETTINGS,
  }, agenticVision);
  tracker.agenticVisionStatus = status;
  const reportStage = stageReport(
    tracker.stage,
    model,
    response,
    Math.round(performance.now() - callStarted),
    status,
  );
  tracker.stages.push(reportStage);
  assertInteractionCompleted(response, tracker.stage);
  const result = parseJson(response.output_text, analysisResultSchema, '기존 분석');
  const totalDurationMs = Math.round(performance.now() - started);
  return {
    result,
    trace: {
      pipeline: 'standard',
      agenticVisionStatus: status,
      stages: tracker.stages.map((stage) => ({ name: stage.name, durationMs: stage.durationMs })),
      totalDurationMs,
    },
    report: completedReport({
      pipeline: 'standard',
      requestedModel: model,
      agenticVisionRequested: agenticVision,
      agenticVisionStatus: status,
      stages: tracker.stages,
      totalDurationMs,
      result,
    }),
  };
}

async function analyzeHarness(
  ai: GoogleGenAI,
  base64: string,
  mimeType: string,
  model: string,
  agenticVision: boolean,
  tracker: RunTracker,
): Promise<AnalysisOutput> {
  const started = performance.now();

  tracker.stage = '증거 수집';
  let stageStarted = performance.now();
  const evidenceCall = await interactionWithOptionalVision(ai, {
    model,
    store: false,
    system_instruction: HARNESS_EVIDENCE_INSTRUCTION,
    input: [
      imageInput(base64, mimeType),
      { type: 'text', text: 'Extract a structured evidence ledger for faithful image reconstruction.' },
    ],
    response_format: jsonFormat(EVIDENCE_JSON_SCHEMA),
    safety_settings: SAFETY_SETTINGS,
  }, agenticVision);
  tracker.agenticVisionStatus = evidenceCall.status;
  tracker.stages.push(stageReport(
    tracker.stage,
    model,
    evidenceCall.response,
    Math.round(performance.now() - stageStarted),
    evidenceCall.status,
  ));
  assertInteractionCompleted(evidenceCall.response, tracker.stage);
  const evidence = parseJson(evidenceCall.response.output_text, harnessEvidenceSchema, '증거 수집') as HarnessEvidence;

  tracker.stage = '교차 비평';
  stageStarted = performance.now();
  const criticResponse = await ai.interactions.create({
    model,
    store: false,
    system_instruction: HARNESS_CRITIC_INSTRUCTION,
    input: `Audit this evidence ledger:\n${JSON.stringify(evidence)}`,
    response_format: jsonFormat(CRITIQUE_JSON_SCHEMA),
    safety_settings: SAFETY_SETTINGS,
  } as never) as InteractionResponse;
  tracker.stages.push(stageReport(
    tracker.stage,
    model,
    criticResponse,
    Math.round(performance.now() - stageStarted),
    'DISABLED',
  ));
  assertInteractionCompleted(criticResponse, tracker.stage);
  const critique = parseJson(criticResponse.output_text, harnessCritiqueSchema, '비평') as HarnessCritique;

  tracker.stage = '최종 합성';
  stageStarted = performance.now();
  const synthesisResponse = await ai.interactions.create({
    model,
    store: false,
    system_instruction: HARNESS_SYNTHESIS_INSTRUCTION,
    input: [
      imageInput(base64, mimeType),
      {
        type: 'text',
        text: `Evidence ledger:\n${JSON.stringify(evidence)}\n\nCritique:\n${JSON.stringify(critique)}\n\nReturn the final bilingual analysis and reconstruction prompt.`,
      },
    ],
    response_format: jsonFormat(ANALYSIS_JSON_SCHEMA),
    safety_settings: SAFETY_SETTINGS,
  } as never) as InteractionResponse;
  tracker.stages.push(stageReport(
    tracker.stage,
    model,
    synthesisResponse,
    Math.round(performance.now() - stageStarted),
    'DISABLED',
  ));
  assertInteractionCompleted(synthesisResponse, tracker.stage);
  const result = parseJson(synthesisResponse.output_text, analysisResultSchema, '최종 합성');
  const totalDurationMs = Math.round(performance.now() - started);

  return {
    result,
    trace: {
      pipeline: 'harness',
      agenticVisionStatus: evidenceCall.status,
      stages: tracker.stages.map((stage) => ({ name: stage.name, durationMs: stage.durationMs })),
      totalDurationMs,
      evidence,
      critique,
    },
    report: completedReport({
      pipeline: 'harness',
      requestedModel: model,
      agenticVisionRequested: agenticVision,
      agenticVisionStatus: evidenceCall.status,
      stages: tracker.stages,
      totalDurationMs,
      result,
    }),
  };
}

export async function analyzeImage(options: {
  apiKey: string;
  base64: string;
  mimeType: string;
  model: string;
  pipeline: AnalysisPipeline;
  agenticVision: boolean;
}): Promise<AnalysisOutput> {
  const started = performance.now();
  const tracker: RunTracker = {
    stage: '초기화',
    stages: [],
    agenticVisionStatus: options.agenticVision ? 'AVAILABLE_NOT_USED' : 'DISABLED',
  };
  try {
    const ai = createClient(options.apiKey);
    return options.pipeline === 'standard'
      ? await analyzeStandard(ai, options.base64, options.mimeType, options.model, options.agenticVision, tracker)
      : await analyzeHarness(ai, options.base64, options.mimeType, options.model, options.agenticVision, tracker);
  } catch (error) {
    const publicError = publicApiError(error);
    const category = failureCategory(publicError.message);
    const inspections = tracker.stages.flatMap((stage) => stage.inspections);
    const report: AnalysisReport = {
      reportVersion: 1,
      createdAt: Date.now(),
      outcome: category === 'safety' ? 'rejected' : 'failed',
      pipeline: options.pipeline,
      requestedModel: options.model,
      resolvedModels: [...new Set(tracker.stages.map((stage) => stage.resolvedModel))],
      agenticVisionRequested: options.agenticVision,
      agenticVisionStatus: tracker.agenticVisionStatus,
      inspections,
      stages: tracker.stages,
      usage: addUsage(tracker.stages.map((stage) => stage.usage)),
      cost: tracker.stages.length ? estimateCost(tracker.stages) : {
        currency: 'USD',
        totalUsd: null,
        agenticAttributedUsd: null,
        pricingModel: null,
        pricingAsOf: '2026-07-21',
        note: '응답 토큰 사용량이 없어 비용을 산정하지 않았습니다.',
      },
      totalDurationMs: Math.round(performance.now() - started),
      failure: {
        stage: tracker.stage,
        category,
        reason: publicError.message,
      },
    };
    throw new AnalysisRunError(publicError.message, report);
  }
}

function classifyModel(id: string, description: string, actions: string[]): Pick<ModelOption, 'task' | 'selectable'> {
  const normalized = `${id} ${description}`.toLowerCase();
  const canGenerate = actions.some((action) => action.toLowerCase().includes('generatecontent'));
  const imageModel = /(?:^|[- ])image(?:$|[- ])|nano.?banana/.test(normalized)
    && !/embedding|classification|detection/.test(normalized);
  if (imageModel && canGenerate) return { task: 'image', selectable: true };
  const analysisModel = id.startsWith('gemini-') && canGenerate
    && !/embedding|tts|audio|robotics|computer-use|deep-research|lyria|veo/.test(normalized);
  if (analysisModel) return { task: 'analysis', selectable: true };
  return { task: 'specialized', selectable: false };
}

export async function listAvailableModels(apiKey: string): Promise<ModelOption[]> {
  const ai = createClient(apiKey);
  try {
    const pager = await ai.models.list({ config: { pageSize: 100, queryBase: true } });
    const models: ModelOption[] = [];
    for await (const model of pager) {
      const id = (model.name ?? '').replace(/^models\//, '');
      if (!id) continue;
      const actions = model.supportedActions ?? [];
      const classification = classifyModel(id, model.description ?? '', actions);
      models.push({
        id,
        displayName: model.displayName || id,
        description: model.description || '설명 없음',
        supportedActions: actions,
        inputTokenLimit: model.inputTokenLimit,
        outputTokenLimit: model.outputTokenLimit,
        ...classification,
      });
    }
    return models.sort((a, b) => a.task.localeCompare(b.task) || a.displayName.localeCompare(b.displayName));
  } catch (error) {
    throw publicApiError(error);
  }
}

export async function generateImageFromPrompt(options: {
  apiKey: string;
  prompt: string;
  settings: AppSettings;
}): Promise<{ base64: string; mimeType: string }> {
  const ai = createClient(options.apiKey);
  try {
    const response = await ai.interactions.create({
      model: options.settings.generationModel,
      store: false,
      input: options.prompt,
      response_modalities: ['image'],
      response_format: {
        type: 'image',
        mime_type: 'image/jpeg',
        delivery: 'inline',
        aspect_ratio: options.settings.aspectRatio,
        image_size: options.settings.imageSize,
      },
      generation_config: {
        image_config: {
          aspect_ratio: options.settings.aspectRatio,
          image_size: options.settings.imageSize,
        },
      },
      safety_settings: SAFETY_SETTINGS,
    } as never);
    if (!response.output_image?.data) throw new Error('모델이 이미지 데이터를 반환하지 않았습니다.');
    return {
      base64: response.output_image.data,
      mimeType: response.output_image.mime_type || 'image/jpeg',
    };
  } catch (error) {
    throw publicApiError(error);
  }
}
