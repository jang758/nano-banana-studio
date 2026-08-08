
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Type } from "@google/genai";
import { ANALYSIS_SYSTEM_INSTRUCTION } from "../constants";
import { AppSettings, ModelType, AnalysisResult } from "../types";

/**
 * World-class implementation for Gemini API interaction.
 * Following strict guidelines for model selection and initialization.
 */

const getAiClient = async (model: ModelType): Promise<GoogleGenAI> => {
  if (model === ModelType.NANO_BANANA_PRO) {
    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
      }
    }
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    face: { type: Type.STRING, description: "Detailed anatomical facial mapping and feature distances." },
    expression: { type: Type.STRING, description: "Physiological micro-expression and facial tension data." },
    body: { type: Type.STRING, description: "Precise measurements (B-W-H, height, weight, WHR, limb ratios). Include global orientation relative to camera." },
    fashion: { type: Type.STRING, description: "Material weight (GSM), tension points, and exact HEX colors." },
    pose: { type: Type.STRING, description: "Geometric joint angles. Strictly distinguish between standing, sitting, prone, and supine." },
    skin: { type: Type.STRING, description: "Elasticity coefficient, Ptosis level, skin tone HEX, and SSS depth." },
    lighting: { type: Type.STRING, description: "Photometric source intensity, Kelvin, and contrast ratios." },
    camera: { type: Type.STRING, description: "Focal length, F-stop, and lens-to-subject orientation angle." },
    background: { type: Type.STRING, description: "Environment depth in meters and geometric layout." },
    effects: { type: Type.STRING, description: "Color grading LUTs, grain size, and optical aberrations." },
    interaction: { type: Type.STRING, description: "Extreme anatomical detail on character-to-character physical contact. Identify specific bone/muscle areas being touched, weight distribution vectors, and how bodies are overlapping or mounting." },
    
    face_ko: { type: Type.STRING },
    expression_ko: { type: Type.STRING },
    body_ko: { type: Type.STRING },
    fashion_ko: { type: Type.STRING },
    pose_ko: { type: Type.STRING },
    skin_ko: { type: Type.STRING },
    lighting_ko: { type: Type.STRING },
    camera_ko: { type: Type.STRING },
    background_ko: { type: Type.STRING },
    effects_ko: { type: Type.STRING },
    interaction_ko: { type: Type.STRING },

    prompt_en: { type: Type.STRING, description: "Must start with view orientation AND detailed physical composition involving all characters with specific contact descriptions." },
    prompt_ko: { type: Type.STRING },
  },
  required: [
    "face", "face_ko",
    "expression", "expression_ko",
    "body", "body_ko",
    "fashion", "fashion_ko",
    "pose", "pose_ko",
    "skin", "skin_ko",
    "lighting", "lighting_ko",
    "camera", "camera_ko",
    "background", "background_ko",
    "effects", "effects_ko",
    "interaction", "interaction_ko",
    "prompt_en", "prompt_ko"
  ],
};

export const analyzeImage = async (base64Image: string, mimeType: string): Promise<AnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelId = 'gemini-3-pro-preview'; 

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: "Perform a forensic-level anatomical and physical interaction analysis. Focus EXCLUSIVELY on the 'Physics of Contact'. Describe exactly which anatomical landmarks (e.g., scapula, lumbar, quadriceps) are in contact, the direction of force, and how the main model's body is mounted or positioned relative to the sub-subject. Use this data to craft a perfect generation prompt." }
        ]
      },
      config: {
        systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: ANALYSIS_SCHEMA,
        safetySettings: SAFETY_SETTINGS,
        temperature: 0.1,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No analysis generated");

    return JSON.parse(text.trim()) as AnalysisResult;
  } catch (error) {
    console.error("Analysis Failed", error);
    throw error;
  }
};

export const generateImageFromPrompt = async (
  prompt: string, 
  settings: AppSettings
): Promise<string> => {
  const ai = await getAiClient(settings.model);
  
  const config: any = {
    temperature: settings.temperature,
    safetySettings: SAFETY_SETTINGS,
    imageConfig: {
      aspectRatio: settings.aspectRatio,
    }
  };

  if (settings.model === ModelType.NANO_BANANA_PRO) {
     config.imageConfig.imageSize = settings.imageSize;
  }

  try {
    const response = await ai.models.generateContent({
      model: settings.model,
      contents: {
        parts: [{ text: prompt }]
      },
      config
    });

    let base64Image = '';
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = part.inlineData.data;
          break;
        }
      }
    }

    if (!base64Image) {
        const textPart = response.candidates?.[0]?.content?.parts?.find(p => p.text);
        if (textPart) throw new Error(`Model Response: ${textPart.text}`);
        throw new Error("No image data returned from model.");
    }

    return base64Image;

  } catch (error: any) {
    if (error.message && error.message.includes("entity was not found")) {
      if (window.aistudio) await window.aistudio.openSelectKey();
      throw new Error("API Key issue. Please re-select a paid project key in the dialog.");
    }
    console.error("Generation Failed", error);
    throw error;
  }
};

export const openApiKeySelection = async () => {
  if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
    await window.aistudio.openSelectKey();
  }
};
