
export enum ModelType {
  NANO_BANANA = 'gemini-2.5-flash-image',
  NANO_BANANA_PRO = 'gemini-3-pro-image-preview',
}

export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type ImageSize = '1K' | '2K' | '4K'; // Only for Pro

export interface AppSettings {
  model: ModelType;
  temperature: number;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  numberOfImages: number;
}

export interface AnalysisResult {
  // Granular Analysis Fields (English)
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
  interaction: string; // New field for detailed character interaction

  // Granular Analysis Fields (Korean)
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
  interaction_ko: string; // New field

  // Prompts
  prompt_en: string;
  prompt_ko: string;
}

export interface WorkspaceSlot {
  id: number;
  originalImage: string | null; // base64
  generatedImage: string | null; // base64
  
  // Editable Fields
  analysisText: string; 
  analysisLang: 'en' | 'ko'; 
  currentPrompt: string;
  promptLang: 'en' | 'ko';
  
  // State
  status: 'idle' | 'analyzing' | 'generating' | 'error';
  error: string | null;
  
  // Data
  rawAnalysis: AnalysisResult | null;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  originalImageBase64?: string;
  generatedImageBase64?: string;
  promptUsed: string;
  analysis?: AnalysisResult;
  settings: AppSettings;
  type: 'generation' | 'edit';
}

export interface ModalData {
  base64: string;
  prompt?: string;
}

// Fixed aistudio declaration to match environment's AIStudio interface and optional modifier
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    JSZip: any;
    saveAs: any;
    aistudio?: AIStudio;
  }
}
