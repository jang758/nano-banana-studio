import {
  FinishReason,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  PartMediaResolutionLevel,
  ThinkingLevel,
  Outcome,
  type GenerateContentConfig,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type SafetySetting,
} from '@google/genai';
import { z } from 'zod';
import {
  ANALYSIS_SYSTEM_INSTRUCTION,
  HARNESS_CRITIC_INSTRUCTION,
  HARNESS_EVIDENCE_INSTRUCTION,
  HARNESS_SYNTHESIS_INSTRUCTION,
  SKIN_REDNESS_MODERATION_INSTRUCTION,
  STANDARD_ANALYSIS_REQUEST,
} from '../constants';
import type {
  AgenticVisionStatus,
  AgenticInspection,
  AnalysisAttemptReport,
  AnalysisOutput,
  AnalysisPipeline,
  AnalysisReport,
  AnalysisResumeState,
  AnalysisResult,
  AnalysisStageReport,
  AppSettings,
  HarnessCritique,
  HarnessEvidence,
  ModelOption,
  TokenUsageSummary,
} from '../types';
import { addUsage, EMPTY_USAGE, estimateCost } from '../utils/analysisReport';

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

export const SAFETY_SETTINGS: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
];

export const MAX_API_ATTEMPTS = 3;

const imagePart = (base64: string, mimeType: string) => ({
  inlineData: { data: base64, mimeType },
  mediaResolution: { level: PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH },
});

export function thinkingConfigForModel(model: string): GenerateContentConfig['thinkingConfig'] | undefined {
  const id = model.trim().replace(/^models\//i, '').toLowerCase();
  if (/^gemini-2\.5(?:-|$)/.test(id)) return { thinkingBudget: -1 };
  if (/^gemini-3(?:[.-]|$)/.test(id)
    || id === 'gemini-pro-latest'
    || id === 'gemini-flash-latest'
    || id === 'gemini-flash-lite-latest') {
    return { thinkingLevel: ThinkingLevel.HIGH };
  }
  return undefined;
}

function structuredConfig(
  model: string,
  systemInstruction: string,
  schema: Record<string, unknown>,
  agenticVision: boolean,
): GenerateContentConfig {
  const thinkingConfig = thinkingConfigForModel(model);
  return {
    systemInstruction: `${systemInstruction.trimEnd()}\n\n${SKIN_REDNESS_MODERATION_INSTRUCTION}`,
    responseMimeType: 'application/json',
    responseJsonSchema: schema,
    safetySettings: SAFETY_SETTINGS,
    ...(thinkingConfig ? { thinkingConfig } : {}),
    ...(agenticVision ? { tools: [{ codeExecution: {} }] } : {}),
  };
}

export function buildAnalysisRequest(options: {
  model: string;
  prompt: string;
  systemInstruction: string;
  schema: Record<string, unknown>;
  base64?: string;
  mimeType?: string;
  agenticVision?: boolean;
}): GenerateContentParameters {
  const parts = [
    { text: options.prompt },
    ...(options.base64 && options.mimeType ? [imagePart(options.base64, options.mimeType)] : []),
  ];
  return {
    model: options.model,
    contents: { parts },
    config: structuredConfig(options.model, options.systemInstruction, options.schema, options.agenticVision === true),
  };
}

function createClient(apiKey: string): GoogleGenAI {
  const key = apiKey.trim();
  if (!key) throw new Error('API 키를 먼저 입력해 주세요. 키는 앱이 실행되는 동안 메모리에만 보관됩니다.');
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

interface ApiErrorShape {
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  body?: unknown;
  error?: { message?: unknown; error?: { message?: unknown } };
}

function apiErrorStatus(error: unknown): number | null {
  const apiError = error as ApiErrorShape;
  if (typeof apiError?.status === 'number') return apiError.status;
  if (typeof apiError?.statusCode === 'number') return apiError.statusCode;
  return null;
}

function apiErrorMessage(error: unknown): string {
  const apiError = error as ApiErrorShape;
  let message = [
    apiError?.error?.error?.message,
    apiError?.error?.message,
    apiError?.message,
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?? String(error);
  if (typeof apiError?.body === 'string') {
    try {
      const body = JSON.parse(apiError.body) as { error?: { message?: unknown } };
      if (typeof body.error?.message === 'string' && body.error.message.trim()) message = body.error.message;
    } catch {
      // JSON 본문이 아니면 SDK 메시지를 사용한다.
    }
  }
  const jsonStart = message.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const payload = JSON.parse(message.slice(jsonStart)) as { error?: { message?: unknown } };
      if (typeof payload.error?.message === 'string' && payload.error.message.trim()) message = payload.error.message;
    } catch {
      // SDK 메시지 안에 완전한 JSON 오류 본문이 없으면 원래 메시지를 사용한다.
    }
  }
  return message
    .replace(/AIza[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]');
}

export function publicApiError(error: unknown): Error {
  const status = apiErrorStatus(error);
  const detail = apiErrorMessage(error) || '세부 메시지가 반환되지 않았습니다.';
  if (/api.?key|unauthenticated|permission|401|403/i.test(detail) || status === 401 || status === 403) {
    return new Error(`Gemini API 인증 오류${status ? ` (${status})` : ''}: ${detail}`);
  }
  if (/quota|resource.?exhausted|429/i.test(detail) || status === 429) {
    return new Error(`Gemini API 할당량 오류${status ? ` (${status})` : ''}: ${detail}`);
  }
  if ((/not found|404|model/i.test(detail) && /not found|404/i.test(detail)) || status === 404) {
    return new Error(`Gemini API 모델 오류${status ? ` (${status})` : ''}: ${detail}`);
  }
  return new Error(`Gemini API 오류${status ? ` (${status})` : ''}: ${detail}`);
}

type FailureCategory = NonNullable<AnalysisReport['failure']>['category'];

function failureCategory(message: string): FailureCategory {
  if (/api 키|api.?key|unauthenticated|permission|401|403/i.test(message)) return 'authentication';
  if (/quota|할당량|resource.?exhausted|429/i.test(message)) return 'quota';
  if (/model|모델|not found|404/i.test(message)) return 'model';
  if (/safety|blocked|blocklist|refus|거절|차단|policy|prohibited/i.test(message)) return 'safety';
  if (/schema|json|스키마/i.test(message)) return 'schema';
  if (/code.?execution|tool|도구/i.test(message)) return 'tool';
  if (/network|fetch|timeout|연결/i.test(message)) return 'network';
  return 'unknown';
}

function isRetryableApiError(error: unknown): boolean {
  const status = apiErrorStatus(error);
  if (status === 408 || status === 429 || (status !== null && status >= 500)) return true;
  return /failed to fetch|network.?error|econnreset|etimedout|timeout|연결.*(실패|끊)/i.test(apiErrorMessage(error));
}

export interface GenerateContentAttemptResult {
  response: GenerateContentResponse;
  attemptCount: number;
  retryReasons: string[];
  attempts?: AnalysisAttemptReport[];
}

export type GenerateContentInvoker = (request: GenerateContentParameters) => Promise<GenerateContentResponse>;

class GenerateContentCallError extends Error {
  readonly status?: number;
  readonly attempts: AnalysisAttemptReport[];
  readonly retryReasons: string[];

  constructor(error: unknown, attempts: AnalysisAttemptReport[], retryReasons: string[]) {
    super(apiErrorMessage(error));
    this.name = 'GenerateContentCallError';
    this.status = apiErrorStatus(error) ?? undefined;
    this.attempts = attempts;
    this.retryReasons = retryReasons;
  }
}

function retryableFinishReason(response: GenerateContentResponse): boolean {
  const reason = responseFinishReason(response);
  return reason === FinishReason.OTHER
    || reason === FinishReason.MALFORMED_FUNCTION_CALL
    || reason === FinishReason.UNEXPECTED_TOOL_CALL;
}

function responseFailureMessage(response: GenerateContentResponse): string | null {
  const promptBlock = responsePromptBlockReason(response);
  if (promptBlock) {
    const detail = response.promptFeedback?.blockReasonMessage;
    return `요청 차단: ${promptBlock}${detail ? ` - ${detail}` : ''}`;
  }
  const finishReason = responseFinishReason(response);
  if (finishReason && finishReason !== FinishReason.STOP) {
    const detail = response.candidates?.[0]?.finishMessage;
    return `응답 중단: ${finishReason}${detail ? ` - ${detail}` : ''}`;
  }
  return null;
}

function responseAttempt(
  response: GenerateContentResponse,
  request: GenerateContentParameters,
  attempt: number,
  durationMs: number,
  status: AnalysisAttemptReport['status'],
  error?: string,
): AnalysisAttemptReport {
  return {
    attempt,
    requestedModel: String(request.model),
    resolvedModel: response.modelVersion || String(request.model),
    durationMs,
    status,
    usage: usageFromResponse(response),
    finishReason: responseFinishReason(response),
    promptBlockReason: responsePromptBlockReason(response),
    ...(error ? { error } : {}),
    inspections: inspectionsFromResponse(response),
  };
}

function errorAttempt(
  error: unknown,
  request: GenerateContentParameters,
  attempt: number,
  durationMs: number,
  status: AnalysisAttemptReport['status'],
): AnalysisAttemptReport {
  return {
    attempt,
    requestedModel: String(request.model),
    resolvedModel: '',
    durationMs,
    status,
    usage: { ...EMPTY_USAGE },
    error: publicApiError(error).message,
    inspections: [],
  };
}

export async function callGenerateContentWithRetry(
  generate: GenerateContentInvoker,
  request: GenerateContentParameters,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  onProgress?: (attemptCount: number, retryReasons: string[], attempts: AnalysisAttemptReport[]) => void,
): Promise<GenerateContentAttemptResult> {
  const retryReasons: string[] = [];
  const attempts: AnalysisAttemptReport[] = [];
  for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt += 1) {
    onProgress?.(attempt, [...retryReasons], [...attempts]);
    const attemptStarted = performance.now();
    try {
      const response = await generate(request);
      const failure = responseFailureMessage(response);
      const willRetry = Boolean(failure) && retryableFinishReason(response) && attempt < MAX_API_ATTEMPTS;
      attempts.push(responseAttempt(
        response,
        request,
        attempt,
        Math.round(performance.now() - attemptStarted),
        failure ? (willRetry ? 'retrying' : 'failed') : 'completed',
        failure ?? undefined,
      ));
      if (!willRetry) {
        onProgress?.(attempt, [...retryReasons], [...attempts]);
        return { response, attemptCount: attempt, retryReasons, attempts };
      }
      retryReasons.push(failure!);
      onProgress?.(attempt, [...retryReasons], [...attempts]);
      await wait(attempt * 500);
    } catch (error) {
      const willRetry = attempt < MAX_API_ATTEMPTS && isRetryableApiError(error);
      attempts.push(errorAttempt(
        error,
        request,
        attempt,
        Math.round(performance.now() - attemptStarted),
        willRetry ? 'retrying' : 'failed',
      ));
      onProgress?.(attempt, [...retryReasons], [...attempts]);
      if (!willRetry) throw new GenerateContentCallError(error, attempts, retryReasons);
      retryReasons.push(publicApiError(error).message);
      onProgress?.(attempt, [...retryReasons], [...attempts]);
      await wait(attempt * 500);
    }
  }
  throw new Error('Gemini API 재시도 흐름이 비정상적으로 종료됐습니다.');
}

function usageFromResponse(response: GenerateContentResponse): TokenUsageSummary {
  return {
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    thoughtTokens: response.usageMetadata?.thoughtsTokenCount ?? 0,
    toolUseTokens: response.usageMetadata?.toolUsePromptTokenCount ?? 0,
    cachedTokens: response.usageMetadata?.cachedContentTokenCount ?? 0,
    totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
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

function responseParts(response: GenerateContentResponse) {
  return response.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
}

function inspectionsFromResponse(response: GenerateContentResponse): AgenticInspection[] {
  const calls = responseParts(response).filter((part) => part.executableCode).map((part) => part.executableCode!);
  const results = responseParts(response).filter((part) => part.codeExecutionResult).map((part) => part.codeExecutionResult!);
  return calls.map((call, index) => {
    const code = call.code ?? '';
    const result = results.find((candidate) => candidate.id && candidate.id === call.id) ?? results[index];
    return {
      index: index + 1,
      area: inspectionArea(code),
      purpose: inspectionPurpose(code),
      codeExcerpt: clipped(code),
      resultExcerpt: clipped(result?.output),
      status: result ? (result.outcome === Outcome.OUTCOME_OK ? 'ok' : 'failed') : 'unknown',
    };
  });
}

function readAgenticStatusFromAttempts(attempts: AnalysisAttemptReport[]): AgenticVisionStatus {
  const inspections = attempts.flatMap((attempt) => attempt.inspections);
  if (!inspections.length) return 'AVAILABLE_NOT_USED';
  return inspections.some((inspection) => inspection.status !== 'ok') ? 'USED_FAILED' : 'USED_OK';
}

function aggregateAgenticStatus(stages: AnalysisStageReport[], requested: boolean): AgenticVisionStatus {
  if (!requested) return 'DISABLED';
  const statuses = stages.map((stage) => stage.agenticVisionStatus);
  if (statuses.includes('UNSUPPORTED')) return 'UNSUPPORTED';
  if (statuses.includes('USED_FAILED')) return 'USED_FAILED';
  if (statuses.includes('USED_OK')) return 'USED_OK';
  return 'AVAILABLE_NOT_USED';
}

function responseFinishReason(response: GenerateContentResponse): string | null {
  return response.candidates?.[0]?.finishReason ?? null;
}

function responsePromptBlockReason(response: GenerateContentResponse): string | null {
  return response.promptFeedback?.blockReason ?? null;
}

function assertGenerateContentCompleted(response: GenerateContentResponse, stage: string): void {
  const promptBlock = responsePromptBlockReason(response);
  if (promptBlock) {
    const detail = response.promptFeedback?.blockReasonMessage;
    throw new Error(`${stage} 요청 차단: ${promptBlock}${detail ? ` - ${detail}` : ''}`);
  }
  const finishReason = responseFinishReason(response);
  if (finishReason && finishReason !== FinishReason.STOP) {
    const detail = response.candidates?.[0]?.finishMessage;
    throw new Error(`${stage} 응답 중단: ${finishReason}${detail ? ` - ${detail}` : ''}`);
  }
}

export function stageReport(
  name: string,
  requestedModel: string,
  call: GenerateContentAttemptResult,
  durationMs: number,
  agenticVisionStatus: AgenticVisionStatus,
): AnalysisStageReport {
  const { response } = call;
  const attempts = call.attempts ?? [responseAttempt(
    response,
    { model: requestedModel, contents: '' },
    call.attemptCount,
    durationMs,
    responseFailureMessage(response) ? 'failed' : 'completed',
    responseFailureMessage(response) ?? undefined,
  )];
  const promptBlockReason = responsePromptBlockReason(response);
  const finishReason = responseFinishReason(response);
  return {
    name,
    requestedModel,
    resolvedModel: response.modelVersion || requestedModel,
    durationMs,
    status: promptBlockReason ? `PROMPT_${promptBlockReason}` : finishReason || 'COMPLETED',
    usage: addUsage(attempts.map((attempt) => attempt.usage)),
    agenticVisionStatus,
    inspections: attempts.flatMap((attempt) => attempt.inspections),
    attemptCount: call.attemptCount,
    retryReasons: call.retryReasons,
    finishReason,
    promptBlockReason,
    attempts,
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
    apiMethod: 'generateContent',
    safetyMode: 'EXPLICIT_OFF',
    requestedModel: options.requestedModel,
    resolvedModels: [...new Set(options.stages.map((stage) => stage.resolvedModel).filter(Boolean))],
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
  readonly resumeState: AnalysisResumeState | null;

  constructor(message: string, report: AnalysisReport, resumeState: AnalysisResumeState | null = null) {
    super(message);
    this.name = 'AnalysisRunError';
    this.report = report;
    this.resumeState = resumeState;
  }
}

interface RunTracker {
  stage: string;
  stages: AnalysisStageReport[];
  agenticVisionStatus: AgenticVisionStatus;
  attemptCount: number;
  retryReasons: string[];
  currentAttempts: AnalysisAttemptReport[];
  stageRecorded: boolean;
  evidence?: HarnessEvidence;
  critique?: HarnessCritique;
  previousDurationMs: number;
}

function beginStage(tracker: RunTracker, name: string) {
  tracker.stage = name;
  tracker.attemptCount = 0;
  tracker.retryReasons = [];
  tracker.currentAttempts = [];
  tracker.stageRecorded = false;
}

function failedStageReport(tracker: RunTracker, requestedModel: string): AnalysisStageReport {
  const attempts = tracker.currentAttempts;
  const lastAttempt = attempts.at(-1);
  const inspections = attempts.flatMap((attempt) => attempt.inspections);
  return {
    name: tracker.stage,
    requestedModel,
    resolvedModel: lastAttempt?.resolvedModel || '',
    durationMs: attempts.reduce((total, attempt) => total + attempt.durationMs, 0),
    status: lastAttempt?.finishReason || 'ERROR',
    usage: addUsage(attempts.map((attempt) => attempt.usage)),
    agenticVisionStatus: tracker.agenticVisionStatus,
    inspections,
    attemptCount: tracker.attemptCount,
    retryReasons: tracker.retryReasons,
    finishReason: lastAttempt?.finishReason,
    promptBlockReason: lastAttempt?.promptBlockReason,
    attempts,
  };
}

function nextResumeStage(pipeline: AnalysisPipeline, stage: string): AnalysisResumeState['nextStage'] {
  if (pipeline === 'standard') return 'standard';
  if (stage === '교차 비평') return 'critic';
  if (stage === '최종 합성') return 'synthesis';
  return 'evidence';
}

async function runGenerateContentStage(
  generate: GenerateContentInvoker,
  request: GenerateContentParameters,
  agenticVision: boolean,
  tracker: RunTracker,
): Promise<{ call: GenerateContentAttemptResult; status: AgenticVisionStatus }> {
  const call = await callGenerateContentWithRetry(
    generate,
    request,
    undefined,
    (attemptCount, retryReasons, attempts) => {
      tracker.attemptCount = attemptCount;
      tracker.retryReasons = retryReasons;
      tracker.currentAttempts = attempts;
    },
  );
  const status = agenticVision
    ? readAgenticStatusFromAttempts(call.attempts ?? [])
    : 'DISABLED';
  if (agenticVision) tracker.agenticVisionStatus = status;
  return { call, status };
}

async function analyzeStandard(
  generate: GenerateContentInvoker,
  base64: string,
  mimeType: string,
  model: string,
  agenticVision: boolean,
  tracker: RunTracker,
): Promise<AnalysisOutput> {
  const started = performance.now();
  beginStage(tracker, '기존 1회 분석');
  const callStarted = performance.now();
  const { call, status } = await runGenerateContentStage(generate, buildAnalysisRequest({
    model,
    prompt: STANDARD_ANALYSIS_REQUEST,
    systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
    schema: ANALYSIS_JSON_SCHEMA,
    base64,
    mimeType,
    agenticVision,
  }), agenticVision, tracker);
  const reportStage = stageReport(
    tracker.stage,
    model,
    call,
    Math.round(performance.now() - callStarted),
    status,
  );
  tracker.stages.push(reportStage);
  tracker.stageRecorded = true;
  assertGenerateContentCompleted(call.response, tracker.stage);
  const result = parseJson(call.response.text, analysisResultSchema, '기존 분석');
  const totalDurationMs = tracker.previousDurationMs + Math.round(performance.now() - started);
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
  generate: GenerateContentInvoker,
  base64: string,
  mimeType: string,
  model: string,
  agenticVision: boolean,
  tracker: RunTracker,
): Promise<AnalysisOutput> {
  const started = performance.now();
  let evidence = tracker.evidence;
  let critique = tracker.critique;
  let stageStarted: number;

  if (!evidence) {
    beginStage(tracker, '증거 수집');
    stageStarted = performance.now();
    const evidenceCall = await runGenerateContentStage(generate, buildAnalysisRequest({
      model,
      prompt: 'Extract a structured evidence ledger for faithful image reconstruction.',
      systemInstruction: HARNESS_EVIDENCE_INSTRUCTION,
      schema: EVIDENCE_JSON_SCHEMA,
      base64,
      mimeType,
      agenticVision,
    }), agenticVision, tracker);
    tracker.stages.push(stageReport(
      tracker.stage,
      model,
      evidenceCall.call,
      Math.round(performance.now() - stageStarted),
      evidenceCall.status,
    ));
    tracker.stageRecorded = true;
    assertGenerateContentCompleted(evidenceCall.call.response, tracker.stage);
    evidence = parseJson(evidenceCall.call.response.text, harnessEvidenceSchema, '증거 수집') as HarnessEvidence;
    tracker.evidence = evidence;
  }

  if (!critique) {
    beginStage(tracker, '교차 비평');
    stageStarted = performance.now();
    const criticCall = await runGenerateContentStage(generate, buildAnalysisRequest({
      model,
      prompt: `Audit this evidence ledger:\n${JSON.stringify(evidence)}`,
      systemInstruction: HARNESS_CRITIC_INSTRUCTION,
      schema: CRITIQUE_JSON_SCHEMA,
    }), false, tracker);
    tracker.stages.push(stageReport(
      tracker.stage,
      model,
      criticCall.call,
      Math.round(performance.now() - stageStarted),
      'DISABLED',
    ));
    tracker.stageRecorded = true;
    assertGenerateContentCompleted(criticCall.call.response, tracker.stage);
    critique = parseJson(criticCall.call.response.text, harnessCritiqueSchema, '비평') as HarnessCritique;
    tracker.critique = critique;
  }

  beginStage(tracker, '최종 합성');
  stageStarted = performance.now();
  const synthesisCall = await runGenerateContentStage(generate, buildAnalysisRequest({
    model,
    prompt: `Evidence ledger:\n${JSON.stringify(evidence)}\n\nCritique:\n${JSON.stringify(critique)}\n\nReturn the final bilingual analysis and reconstruction prompt.`,
    systemInstruction: HARNESS_SYNTHESIS_INSTRUCTION,
    schema: ANALYSIS_JSON_SCHEMA,
    base64,
    mimeType,
  }), false, tracker);
  tracker.stages.push(stageReport(
    tracker.stage,
    model,
    synthesisCall.call,
    Math.round(performance.now() - stageStarted),
    'DISABLED',
  ));
  tracker.stageRecorded = true;
  assertGenerateContentCompleted(synthesisCall.call.response, tracker.stage);
  const result = parseJson(synthesisCall.call.response.text, analysisResultSchema, '최종 합성');
  const totalDurationMs = tracker.previousDurationMs + Math.round(performance.now() - started);
  const agenticStatus = aggregateAgenticStatus(tracker.stages, agenticVision);

  return {
    result,
    trace: {
      pipeline: 'harness',
      agenticVisionStatus: agenticStatus,
      stages: tracker.stages.map((stage) => ({ name: stage.name, durationMs: stage.durationMs })),
      totalDurationMs,
      evidence,
      critique,
    },
    report: completedReport({
      pipeline: 'harness',
      requestedModel: model,
      agenticVisionRequested: agenticVision,
      agenticVisionStatus: agenticStatus,
      stages: tracker.stages,
      totalDurationMs,
      result,
    }),
  };
}

export interface AnalyzeImageOptions {
  apiKey: string;
  base64: string;
  mimeType: string;
  model: string;
  pipeline: AnalysisPipeline;
  agenticVision: boolean;
  resumeState?: AnalysisResumeState | null;
}

export async function analyzeImage(options: AnalyzeImageOptions, dependencies: { generateContent?: GenerateContentInvoker } = {}): Promise<AnalysisOutput> {
  const started = performance.now();
  const resumeState = options.resumeState?.pipeline === options.pipeline ? options.resumeState : null;
  const agenticVision = resumeState?.agenticVision ?? options.agenticVision;
  const previousStages = resumeState?.stages.map((stage) => ({
    ...stage,
    usage: { ...stage.usage },
    inspections: [...stage.inspections],
    attempts: stage.attempts?.map((attempt) => ({
      ...attempt,
      usage: { ...attempt.usage },
      inspections: [...attempt.inspections],
    })),
  })) ?? [];
  const tracker: RunTracker = {
    stage: '초기화',
    stages: previousStages,
    agenticVisionStatus: aggregateAgenticStatus(previousStages, agenticVision),
    attemptCount: 0,
    retryReasons: [],
    currentAttempts: [],
    stageRecorded: false,
    evidence: resumeState?.evidence,
    critique: resumeState?.critique,
    previousDurationMs: resumeState?.totalDurationMs ?? 0,
  };
  try {
    let generateContent = dependencies.generateContent;
    if (!generateContent) {
      const ai = createClient(options.apiKey);
      generateContent = (parameters: GenerateContentParameters) => ai.models.generateContent(parameters);
    }
    return options.pipeline === 'standard'
      ? await analyzeStandard(generateContent, options.base64, options.mimeType, options.model, agenticVision, tracker)
      : await analyzeHarness(generateContent, options.base64, options.mimeType, options.model, agenticVision, tracker);
  } catch (error) {
    const publicError = publicApiError(error);
    const category = failureCategory(publicError.message);
    if (agenticVision && isAgenticUnsupported(publicError)) tracker.agenticVisionStatus = 'UNSUPPORTED';
    if (!tracker.stageRecorded && tracker.currentAttempts.length) {
      tracker.stages.push(failedStageReport(tracker, options.model));
      tracker.stageRecorded = true;
    }
    const inspections = tracker.stages.flatMap((stage) => stage.inspections);
    const totalDurationMs = tracker.previousDurationMs + Math.round(performance.now() - started);
    const report: AnalysisReport = {
      reportVersion: 1,
      createdAt: Date.now(),
      outcome: category === 'safety' ? 'rejected' : 'failed',
      pipeline: options.pipeline,
      apiMethod: 'generateContent',
      safetyMode: 'EXPLICIT_OFF',
      requestedModel: options.model,
      resolvedModels: [...new Set(tracker.stages.map((stage) => stage.resolvedModel).filter(Boolean))],
      agenticVisionRequested: agenticVision,
      agenticVisionStatus: tracker.agenticVisionStatus,
      inspections,
      stages: tracker.stages,
      usage: addUsage(tracker.stages.map((stage) => stage.usage)),
      cost: tracker.stages.length ? estimateCost(tracker.stages) : {
        currency: 'USD',
        totalUsd: null,
        agenticAttributedUsd: null,
        pricingModel: null,
        pricingAsOf: '2026-08-09',
        note: '응답 토큰 사용량이 없어 비용을 산정하지 않았습니다.',
      },
      totalDurationMs,
      failure: {
        stage: tracker.stage,
        category,
        reason: publicError.message,
        attemptCount: tracker.attemptCount,
        retryReasons: tracker.retryReasons,
      },
    };
    const nextState: AnalysisResumeState = {
      pipeline: options.pipeline,
      agenticVision,
      nextStage: nextResumeStage(options.pipeline, tracker.stage),
      stages: tracker.stages,
      ...(tracker.evidence ? { evidence: tracker.evidence } : {}),
      ...(tracker.critique ? { critique: tracker.critique } : {}),
      totalDurationMs,
    };
    throw new AnalysisRunError(publicError.message, report, nextState);
  }
}

export function classifyModel(id: string, description: string, actions: string[]): Pick<ModelOption, 'task' | 'selectable'> {
  const normalized = `${id} ${description}`.toLowerCase();
  const normalizedId = id.toLowerCase();
  const canGenerate = actions.some((action) => action.toLowerCase() === 'generatecontent');
  const imageModel = /(?:^|-)image(?:-|$)|image-generation|nano.?banana/.test(normalizedId)
    && !/embedding|classification|detection/.test(normalizedId);
  if (imageModel && canGenerate) return { task: 'image', selectable: true };
  const analysisModel = normalizedId.startsWith('gemini-') && canGenerate
    && !/embedding|(?:^|[-_ ])embed(?:$|[-_ ])|tts|audio|live|robotics|computer[-_ ]?use|deep[-_ ]?research|lyria|veo|imagen|gemma|omni|antigravity|(?:^|[-_ ])agent(?:$|[-_ ])/.test(normalized);
  if (analysisModel) return { task: 'analysis', selectable: true };
  return { task: 'specialized', selectable: false };
}

export async function listAvailableModels(apiKey: string): Promise<ModelOption[]> {
  const ai = createClient(apiKey);
  try {
    const pager = await ai.models.list({ config: { pageSize: 100, queryBase: true } });
    const models = new Map<string, ModelOption>();
    for await (const model of pager) {
      const id = (model.name ?? '').replace(/^models\//, '');
      if (!id) continue;
      const actions = model.supportedActions ?? [];
      const classification = classifyModel(id, model.description ?? '', actions);
      models.set(id, {
        id,
        displayName: model.displayName || id,
        description: model.description || '설명 없음',
        supportedActions: actions,
        inputTokenLimit: model.inputTokenLimit,
        outputTokenLimit: model.outputTokenLimit,
        ...classification,
        source: 'api',
      });
    }
    return [...models.values()].sort((a, b) => a.task.localeCompare(b.task) || a.displayName.localeCompare(b.displayName));
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
    const request: GenerateContentParameters = {
      model: options.settings.generationModel,
      contents: options.prompt,
      config: {
        safetySettings: SAFETY_SETTINGS,
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: options.settings.aspectRatio,
          imageSize: options.settings.imageSize,
        },
      },
    };
    const { response } = await callGenerateContentWithRetry(
      (parameters) => ai.models.generateContent(parameters),
      request,
    );
    assertGenerateContentCompleted(response, '이미지 생성');
    const inlineData = responseParts(response).find((part) => part.inlineData)?.inlineData;
    if (!inlineData?.data) throw new Error('모델이 이미지 데이터를 반환하지 않았습니다.');
    return {
      base64: inlineData.data,
      mimeType: inlineData.mimeType || 'image/jpeg',
    };
  } catch (error) {
    throw publicApiError(error);
  }
}
