export type AnalysisPipeline = 'standard' | 'harness';

export type AgenticVisionStatus =
  | 'DISABLED'
  | 'AVAILABLE_NOT_USED'
  | 'USED_OK'
  | 'USED_FAILED'
  | 'UNSUPPORTED';

export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';
export type ImageSize = '1K' | '2K' | '4K';

export interface ModelOption {
  id: string;
  displayName: string;
  description: string;
  supportedActions: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  task: 'analysis' | 'image' | 'specialized';
  selectable: boolean;
}

export interface AppSettings {
  analysisModel: string;
  generationModel: string;
  agenticVision: boolean;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
}

export interface AnalysisResult {
  face: string;
  expression: string;
  body: string;
  fashion: string;
  pose: string;
  skin: string;
  lighting: string;
  camera: string;
  background: string;
  effects: string;
  interaction: string;
  face_ko: string;
  expression_ko: string;
  body_ko: string;
  fashion_ko: string;
  pose_ko: string;
  skin_ko: string;
  lighting_ko: string;
  camera_ko: string;
  background_ko: string;
  effects_ko: string;
  interaction_ko: string;
  prompt_en: string;
  prompt_ko: string;
}

export interface HarnessEvidence {
  composition: string;
  subjects: string[];
  visible_contacts: string[];
  pose_and_support: string[];
  materials_and_surface: string[];
  lighting_and_camera: string[];
  uncertainties: string[];
}

export interface HarnessCritique {
  accepted: string[];
  corrections: string[];
  unsupported_claims: string[];
  synthesis_rules: string[];
}

export interface AnalysisTrace {
  pipeline: AnalysisPipeline;
  agenticVisionStatus: AgenticVisionStatus;
  stages: Array<{ name: string; durationMs: number }>;
  totalDurationMs: number;
  evidence?: HarnessEvidence;
  critique?: HarnessCritique;
}

export interface TokenUsageSummary {
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  toolUseTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

export interface AgenticInspection {
  index: number;
  area: string;
  purpose: string;
  codeExcerpt: string;
  resultExcerpt: string;
  status: 'ok' | 'failed' | 'unknown';
}

export interface AnalysisStageReport {
  name: string;
  requestedModel: string;
  resolvedModel: string;
  durationMs: number;
  status: string;
  usage: TokenUsageSummary;
  agenticVisionStatus: AgenticVisionStatus;
  inspections: AgenticInspection[];
}

export interface CostEstimate {
  currency: 'USD';
  totalUsd: number | null;
  agenticAttributedUsd: number | null;
  pricingModel: string | null;
  pricingAsOf: string;
  note: string;
}

export interface AnalysisReport {
  reportVersion: 1;
  createdAt: number;
  outcome: 'completed' | 'failed' | 'rejected';
  pipeline: AnalysisPipeline;
  requestedModel: string;
  resolvedModels: string[];
  agenticVisionRequested: boolean;
  agenticVisionStatus: AgenticVisionStatus;
  inspections: AgenticInspection[];
  stages: AnalysisStageReport[];
  usage: TokenUsageSummary;
  cost: CostEstimate;
  totalDurationMs: number;
  finalAnalysis?: AnalysisResult;
  failure?: {
    stage: string;
    reason: string;
    category: 'authentication' | 'quota' | 'model' | 'safety' | 'schema' | 'tool' | 'network' | 'unknown';
  };
}

export interface AnalysisOutput {
  result: AnalysisResult;
  trace: AnalysisTrace;
  report: AnalysisReport;
}

export interface WorkspaceSlot {
  id: string;
  originalImage: string | null;
  originalMimeType: string | null;
  generatedImage: string | null;
  generatedMimeType: string | null;
  analysisText: string;
  analysisLang: 'en' | 'ko';
  currentPrompt: string;
  promptLang: 'en' | 'ko';
  status: 'idle' | 'analyzing' | 'generating' | 'saving' | 'error';
  error: string | null;
  rawAnalysis: AnalysisResult | null;
  trace: AnalysisTrace | null;
  report: AnalysisReport | null;
  savedHistoryId: string | null;
}

export interface HistoryMetadata {
  id: string;
  timestamp: number;
  title: string;
  promptUsed: string;
  pipeline: AnalysisPipeline;
  type: 'analysis' | 'generation' | 'edit';
  originalMimeType?: string;
  generatedMimeType?: string;
  thumbnailId?: string;
  searchText: string;
  report?: AnalysisReport;
}

export interface HistoryRecord extends HistoryMetadata {
  analysis?: AnalysisResult;
  analysisText: string;
  analysisLang: 'en' | 'ko';
  promptLang: 'en' | 'ko';
  trace?: AnalysisTrace;
  report?: AnalysisReport;
  settings: AppSettings;
  originalFile?: string;
  generatedFile?: string;
}

export interface HistorySaveInput {
  id?: string;
  timestamp?: number;
  title?: string;
  originalImage?: string | null;
  originalMimeType?: string | null;
  generatedImage?: string | null;
  generatedMimeType?: string | null;
  promptUsed: string;
  analysis?: AnalysisResult | null;
  analysisText: string;
  analysisLang: 'en' | 'ko';
  promptLang: 'en' | 'ko';
  trace?: AnalysisTrace | null;
  report?: AnalysisReport | null;
  settings: AppSettings;
  pipeline: AnalysisPipeline;
  type: 'analysis' | 'generation' | 'edit';
}

export interface LoadedHistoryItem extends HistoryRecord {
  originalImageBase64?: string;
  generatedImageBase64?: string;
}

export interface HistoryPage {
  items: HistoryMetadata[];
  nextBefore?: number;
}

export interface StorageStatus {
  supported: boolean;
  persisted: boolean;
  usage: number;
  quota: number;
}

export interface ModalData {
  base64: string;
  mimeType: string;
  prompt?: string;
}
