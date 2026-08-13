import { BlockedReason, FinishReason, GenerateContentResponse, GoogleGenAI } from '@google/genai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_API_ATTEMPTS,
  analyzeImage,
  buildAnalysisRequest,
  callGenerateContentWithRetry,
  classifyModel,
  listAvailableModels,
  publicApiError,
  stageReport,
  thinkingConfigForModel,
} from '../services/geminiService';

const finalAnalysis = {
  face: 'face', expression: 'expression', body: 'body', fashion: 'fashion', pose: 'pose', skin: 'skin',
  lighting: 'lighting', camera: 'camera', background: 'background', effects: 'effects', interaction: 'interaction',
  face_ko: '얼굴', expression_ko: '표정', body_ko: '신체', fashion_ko: '의상', pose_ko: '자세', skin_ko: '피부',
  lighting_ko: '조명', camera_ko: '카메라', background_ko: '배경', effects_ko: '효과', interaction_ko: '상호작용',
  prompt_en: 'prompt', prompt_ko: '프롬프트',
};

function jsonResponse(value: unknown, extraParts: Array<Record<string, unknown>> = []): GenerateContentResponse {
  const response = new GenerateContentResponse();
  response.modelVersion = 'gemini-3.1-pro-preview';
  response.usageMetadata = { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 };
  response.candidates = [{
    finishReason: FinishReason.STOP,
    content: { parts: [{ text: JSON.stringify(value) }, ...extraParts] },
  }];
  return response;
}

const request = (agenticVision = false) => buildAnalysisRequest({
  model: 'gemini-pro-latest',
  prompt: 'analyze',
  systemInstruction: 'system',
  schema: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'] },
  base64: 'AAAA',
  mimeType: 'image/png',
  agenticVision,
});

afterEach(() => vi.restoreAllMocks());

describe('generateContent request contract', () => {
  it('serializes to the generateContent endpoint with explicit OFF safety settings', async () => {
    let url = '';
    let body = '';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const outgoing = input instanceof Request ? input : new Request(input, init);
      url = outgoing.url;
      body = await outgoing.clone().text();
      return new Response(JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text: '{"result":"ok"}' }] }, finishReason: 'STOP' }],
        modelVersion: 'gemini-pro-latest',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const ai = new GoogleGenAI({ apiKey: 'TEST_KEY_ONLY' });
    await ai.models.generateContent(request(false));

    expect(url).toContain('/v1beta/models/gemini-pro-latest:generateContent');
    const payload = JSON.parse(body) as {
      safetySettings: Array<{ category: string; threshold: string }>;
      generationConfig?: { responseMimeType?: string; responseJsonSchema?: Record<string, unknown> };
      tools?: unknown;
    };
    expect(payload.safetySettings).toHaveLength(4);
    expect(payload.safetySettings.every((setting) => setting.threshold === 'OFF')).toBe(true);
    expect(payload.generationConfig?.responseMimeType).toBe('application/json');
    expect(payload.generationConfig?.responseJsonSchema).toMatchObject({ type: 'object' });
    expect(payload.generationConfig).toMatchObject({ thinkingConfig: { thinkingLevel: 'HIGH' } });
    expect(payload.tools).toBeUndefined();
  });

  it('splits thinking settings by model generation and adds high resolution only with an image', () => {
    expect(thinkingConfigForModel('gemini-3.7-flash')).toEqual({ thinkingLevel: 'HIGH' });
    expect(thinkingConfigForModel('gemini-3.6-flash')).toEqual({ thinkingLevel: 'HIGH' });
    expect(thinkingConfigForModel('gemini-2.5-pro')).toEqual({ thinkingBudget: -1 });
    expect(thinkingConfigForModel('gemini-private-vision')).toBeUndefined();

    const imageRequest = request(false);
    const imageParts = (imageRequest.contents as { parts: Array<Record<string, unknown>> }).parts;
    expect(imageParts[1]).toMatchObject({ mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' } });

    const textRequest = buildAnalysisRequest({
      model: 'gemini-2.5-pro',
      prompt: 'text only',
      systemInstruction: 'system',
      schema: { type: 'object' },
    });
    expect(textRequest.config?.thinkingConfig).toEqual({ thinkingBudget: -1 });
    expect((textRequest.contents as { parts: Array<Record<string, unknown>> }).parts).toHaveLength(1);
    expect(textRequest.config).not.toHaveProperty('temperature');
    expect(textRequest.config).not.toHaveProperty('topP');
    expect(textRequest.config).not.toHaveProperty('topK');
  });

  it('adds code execution without changing the selected model', () => {
    const payload = buildAnalysisRequest({
      model: 'gemini-3.7-flash',
      prompt: 'inspect',
      systemInstruction: 'system',
      schema: { type: 'object' },
      base64: 'AAAA',
      mimeType: 'image/png',
      agenticVision: true,
    });
    expect(payload.model).toBe('gemini-3.7-flash');
    expect(payload.config?.thinkingConfig).toEqual({ thinkingLevel: 'HIGH' });
    expect(payload.config?.tools).toEqual([{ codeExecution: {} }]);
  });

  it('retries retryable failures twice and then returns the third response', async () => {
    const success = new GenerateContentResponse();
    success.candidates = [];
    const generate = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('temporary'), { status: 500 }))
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 429 }))
      .mockResolvedValueOnce(success);
    const result = await callGenerateContentWithRetry(generate, request(), async () => undefined);
    expect(generate).toHaveBeenCalledTimes(MAX_API_ATTEMPTS);
    expect(result.attemptCount).toBe(3);
    expect(result.retryReasons).toHaveLength(2);
  });

  it('does not retry invalid requests', async () => {
    const generate = vi.fn().mockRejectedValue(Object.assign(new Error('invalid safety setting'), { status: 400 }));
    await expect(callGenerateContentWithRetry(generate, request(), async () => undefined)).rejects.toThrow('invalid safety setting');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('retries HTTP 408 but never retries authentication failures', async () => {
    const success = jsonResponse(finalAnalysis);
    const timeoutThenSuccess = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('request timeout'), { status: 408 }))
      .mockResolvedValueOnce(success);
    await callGenerateContentWithRetry(timeoutThenSuccess, request(), async () => undefined);
    expect(timeoutThenSuccess).toHaveBeenCalledTimes(2);

    const unauthorized = vi.fn().mockRejectedValue(Object.assign(new Error('bad key'), { status: 401 }));
    await expect(callGenerateContentWithRetry(unauthorized, request(), async () => undefined)).rejects.toThrow('bad key');
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it('retries transient finish reasons with the identical request and records every attempt', async () => {
    const interrupted = jsonResponse(finalAnalysis);
    interrupted.candidates![0].finishReason = FinishReason.OTHER;
    const success = jsonResponse(finalAnalysis);
    const generate = vi.fn().mockResolvedValueOnce(interrupted).mockResolvedValueOnce(success);
    const outgoing = request();
    const call = await callGenerateContentWithRetry(generate, outgoing, async () => undefined);
    expect(generate).toHaveBeenNthCalledWith(1, outgoing);
    expect(generate).toHaveBeenNthCalledWith(2, outgoing);
    expect(call.attempts?.map((attempt) => attempt.status)).toEqual(['retrying', 'completed']);
    const stage = stageReport('test', 'gemini-pro-latest', call, 10, 'DISABLED');
    expect(stage.usage.totalTokens).toBe(30);
  });

  it('maps model, usage, finish reason, prompt feedback, and code execution into the report stage', () => {
    const response = {
      modelVersion: 'gemini-3.1-pro-preview',
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 20,
        thoughtsTokenCount: 10,
        toolUsePromptTokenCount: 5,
        cachedContentTokenCount: 2,
        totalTokenCount: 135,
      },
      promptFeedback: {},
      candidates: [{
        finishReason: 'STOP',
        content: {
          parts: [
            { executableCode: { code: '# inspect hand\ncrop(10, 20, 30, 40)', language: 'PYTHON' } },
            { codeExecutionResult: { outcome: 'OUTCOME_OK', output: 'detail confirmed' } },
          ],
        },
      }],
    } as GenerateContentResponse;
    const stage = stageReport('기존 1회 분석', 'gemini-pro-latest', {
      response,
      attemptCount: 2,
      retryReasons: ['temporary'],
    }, 1200, 'USED_OK');
    expect(stage.resolvedModel).toBe('gemini-3.1-pro-preview');
    expect(stage.usage.totalTokens).toBe(135);
    expect(stage.finishReason).toBe('STOP');
    expect(stage.attemptCount).toBe(2);
    expect(stage.inspections[0]?.resultExcerpt).toContain('detail confirmed');
  });

  it('uses the same selected model and explicit OFF safety settings in all three harness stages', async () => {
    const evidence = {
      composition: 'composition', subjects: ['subject'], visible_contacts: ['contact'], pose_and_support: ['pose'],
      materials_and_surface: ['material'], lighting_and_camera: ['light'], uncertainties: [],
    };
    const critique = { accepted: ['ok'], corrections: [], unsupported_claims: [], synthesis_rules: ['keep'] };
    const generate = vi.fn()
      .mockResolvedValueOnce(jsonResponse(evidence, [
        { executableCode: { code: '# inspect hand\ncrop(1, 2, 3, 4)', language: 'PYTHON' } },
        { codeExecutionResult: { outcome: 'OUTCOME_OK', output: 'confirmed' } },
      ]))
      .mockResolvedValueOnce(jsonResponse(critique))
      .mockResolvedValueOnce(jsonResponse(finalAnalysis));

    const output = await analyzeImage({
      apiKey: '',
      base64: 'AAAA',
      mimeType: 'image/png',
      model: 'gemini-pro-latest',
      pipeline: 'harness',
      agenticVision: true,
    }, { generateContent: generate });

    expect(generate).toHaveBeenCalledTimes(3);
    for (const [call] of generate.mock.calls) {
      expect(call.model).toBe('gemini-pro-latest');
      expect(call.config.safetySettings).toHaveLength(4);
      expect(call.config.safetySettings.every((setting: { threshold: string }) => setting.threshold === 'OFF')).toBe(true);
    }
    expect(generate.mock.calls[0]?.[0].config.tools).toEqual([{ codeExecution: {} }]);
    expect(generate.mock.calls[1]?.[0].config.tools).toBeUndefined();
    expect(generate.mock.calls[2]?.[0].config.tools).toBeUndefined();
    expect(output.report.apiMethod).toBe('generateContent');
    expect(output.report.safetyMode).toBe('EXPLICIT_OFF');
    expect(output.report.agenticVisionStatus).toBe('USED_OK');
  });

  it('preserves the API block reason in the failed in-app report', async () => {
    const blocked = new GenerateContentResponse();
    blocked.promptFeedback = {
      blockReason: BlockedReason.PROHIBITED_CONTENT,
      blockReasonMessage: 'Core policy blocked this request.',
    };
    blocked.candidates = [];
    const generate = vi.fn().mockResolvedValue(blocked);

    await expect(analyzeImage({
      apiKey: '',
      base64: 'AAAA',
      mimeType: 'image/png',
      model: 'gemini-pro-latest',
      pipeline: 'standard',
      agenticVision: false,
    }, { generateContent: generate })).rejects.toMatchObject({
      report: {
        outcome: 'rejected',
        stages: [{ promptBlockReason: 'PROHIBITED_CONTENT' }],
        failure: {
          category: 'safety',
          reason: expect.stringContaining('PROHIBITED_CONTENT'),
        },
      },
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('resumes a failed harness at the failed stage and permits only the user-selected model to change', async () => {
    const evidence = {
      composition: 'composition', subjects: ['subject'], visible_contacts: ['contact'], pose_and_support: ['pose'],
      materials_and_surface: ['material'], lighting_and_camera: ['light'], uncertainties: [],
    };
    const critique = { accepted: ['ok'], corrections: [], unsupported_claims: [], synthesis_rules: ['keep'] };
    const firstGenerate = vi.fn()
      .mockResolvedValueOnce(jsonResponse(evidence))
      .mockRejectedValueOnce(Object.assign(new Error('invalid critic request'), { status: 400 }));

    let resumeState;
    try {
      await analyzeImage({
        apiKey: '', base64: 'AAAA', mimeType: 'image/png', model: 'gemini-pro-latest', pipeline: 'harness', agenticVision: false,
      }, { generateContent: firstGenerate });
      throw new Error('expected analysis failure');
    } catch (error) {
      expect(error).toMatchObject({ resumeState: { nextStage: 'critic', evidence } });
      resumeState = (error as { resumeState: NonNullable<Parameters<typeof analyzeImage>[0]['resumeState']> }).resumeState;
    }

    const resumedGenerate = vi.fn()
      .mockResolvedValueOnce(jsonResponse(critique))
      .mockResolvedValueOnce(jsonResponse(finalAnalysis));
    const output = await analyzeImage({
      apiKey: '', base64: 'AAAA', mimeType: 'image/png', model: 'gemini-2.5-pro', pipeline: 'harness', agenticVision: false, resumeState,
    }, { generateContent: resumedGenerate });

    expect(firstGenerate).toHaveBeenCalledTimes(2);
    expect(resumedGenerate).toHaveBeenCalledTimes(2);
    expect(resumedGenerate.mock.calls.every(([call]) => call.model === 'gemini-2.5-pro')).toBe(true);
    expect(output.report.stages.filter((stage) => stage.name === '증거 수집')).toHaveLength(1);
    expect(output.report.stages.some((stage) => stage.name === '교차 비평' && stage.requestedModel === 'gemini-2.5-pro')).toBe(true);
  });
});

describe('public API errors', () => {
  it('extracts the concise API message from an SDK JSON string', () => {
    const error = Object.assign(new Error(JSON.stringify({
      error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' },
    })), { status: 400 });

    expect(publicApiError(error).message).toBe(
      'Gemini API 인증 오류 (400): API key not valid. Please pass a valid API key.',
    );
  });
});

describe('Models API catalog', () => {
  it('follows nextPageToken, deduplicates ids, and excludes specialized models from analysis selection', async () => {
    const seenUrls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const outgoing = input instanceof Request ? input : new Request(input, init);
      seenUrls.push(outgoing.url);
      const secondPage = outgoing.url.includes('pageToken=NEXT_PAGE');
      const body = secondPage ? {
        models: [
          { name: 'models/gemini-3.6-flash', displayName: 'duplicate', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.1-flash-live-preview', displayName: 'Live', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.1-pro-preview-customtools', displayName: 'Custom Tools', supportedGenerationMethods: ['generateContent'] },
        ],
      } : {
        models: [
          { name: 'models/gemini-3.6-flash', displayName: 'Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-embedding-001', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
        ],
        nextPageToken: 'NEXT_PAGE',
      };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const models = await listAvailableModels('TEST_KEY_ONLY');
    expect(seenUrls).toHaveLength(2);
    expect(seenUrls[1]).toContain('pageToken=NEXT_PAGE');
    expect(seenUrls.every((url) => !/[?&]key=/.test(url))).toBe(true);
    expect(models.filter((model) => model.id === 'gemini-3.6-flash')).toHaveLength(1);
    expect(models.find((model) => model.id === 'gemini-3.1-pro-preview-customtools')).toMatchObject({ task: 'analysis', selectable: true, source: 'api' });
    expect(models.find((model) => model.id === 'gemini-3.1-flash-live-preview')).toMatchObject({ task: 'specialized', selectable: false });
  });

  it('classifies only analysis-capable generateContent families as selectable analysis models', () => {
    expect(classifyModel('gemini-3.6-flash', '', ['generateContent'])).toEqual({ task: 'analysis', selectable: true });
    expect(classifyModel('gemini-3.1-flash-image', '', ['generateContent'])).toEqual({ task: 'image', selectable: true });
    for (const id of [
      'gemini-3.1-flash-live-preview', 'gemini-3.1-flash-tts-preview', 'gemini-embedding-001',
      'gemini-robotics-er-2-preview', 'gemini-2.5-computer-use-preview', 'gemini-omni-flash',
    ]) {
      expect(classifyModel(id, '', ['generateContent'])).toEqual({ task: 'specialized', selectable: false });
    }
  });
});
