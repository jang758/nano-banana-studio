import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Expand,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Save,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';
import { AnalysisRunError, analyzeImage, generateImageFromPrompt } from '../services/geminiService';
import type { AnalysisPipeline, AppSettings, ModalData, WorkspaceSlot as Slot } from '../types';
import { formatAnalysis } from '../utils/analysisFormat';
import { getClipboardImage, readImageFile, takeSelectedFile } from '../utils/imageInput';
import { agenticLabel, AnalysisReportView } from './AnalysisReportView';

interface Props {
  slot: Slot;
  index: number;
  settings: AppSettings;
  pipeline: AnalysisPipeline;
  apiKey: string;
  isPasteTarget: boolean;
  canDelete: boolean;
  onActivate: () => void;
  onUpdate: (id: string, updates: Partial<Slot>) => void;
  onSave: (slot: Slot, type: 'analysis' | 'generation' | 'edit') => Promise<string>;
  onOpenModal: (data: ModalData) => void;
  onDelete: (id: string) => void;
}

const dataUrl = (base64: string, mimeType: string | null) => `data:${mimeType || 'image/png'};base64,${base64}`;

export function WorkspaceSlot({
  slot,
  index,
  settings,
  pipeline,
  apiKey,
  isPasteTarget,
  canDelete,
  onActivate,
  onUpdate,
  onSave,
  onOpenModal,
  onDelete,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState<'analysis' | 'prompt' | null>(null);

  const runAnalysis = async (base64: string, mimeType: string, resumeState: Slot['resumeState'] = null) => {
    onUpdate(slot.id, { status: 'analyzing', error: null, report: null, resumeState });
    try {
      const output = await analyzeImage({
        apiKey,
        base64,
        mimeType,
        model: settings.analysisModel,
        pipeline,
        agenticVision: settings.agenticVision,
        resumeState,
      });
      const completed: Slot = {
        ...slot,
        originalImage: base64,
        originalMimeType: mimeType,
        generatedImage: null,
        generatedMimeType: null,
        rawAnalysis: output.result,
        trace: output.trace,
        report: output.report,
        analysisText: formatAnalysis(output.result, 'en'),
        analysisLang: 'en',
        currentPrompt: output.result.prompt_en,
        promptLang: 'en',
        status: 'saving',
        error: null,
        savedHistoryId: null,
        resumeState: null,
      };
      onUpdate(slot.id, completed);
      const id = await onSave(completed, 'analysis');
      onUpdate(slot.id, { status: 'idle', savedHistoryId: id });
    } catch (error) {
      onUpdate(slot.id, {
        status: 'error',
        error: error instanceof Error ? error.message : '분석에 실패했습니다.',
        ...(error instanceof AnalysisRunError ? { report: error.report, resumeState: error.resumeState } : { resumeState: null }),
      });
    }
  };

  const useFile = async (file: File) => {
    try {
      const { base64, mimeType } = await readImageFile(file);
      onUpdate(slot.id, {
        originalImage: base64,
        originalMimeType: mimeType,
        generatedImage: null,
        generatedMimeType: null,
        rawAnalysis: null,
        trace: null,
        report: null,
        analysisText: '',
        currentPrompt: '',
        savedHistoryId: null,
        resumeState: null,
        status: 'analyzing',
        error: null,
      });
      await runAnalysis(base64, mimeType);
    } catch (error) {
      onUpdate(slot.id, {
        status: 'error',
        error: error instanceof Error ? error.message : '이미지를 읽지 못했습니다.',
      });
    }
  };

  useEffect(() => {
    if (!isPasteTarget) return;
    const handlePaste = (event: ClipboardEvent) => {
      if (busy || !event.clipboardData) return;
      const file = getClipboardImage(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void useFile(file);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  });

  const switchAnalysisLanguage = (language: 'en' | 'ko') => {
    if (!slot.rawAnalysis) return;
    onUpdate(slot.id, { analysisLang: language, analysisText: formatAnalysis(slot.rawAnalysis, language) });
  };

  const switchPromptLanguage = (language: 'en' | 'ko') => {
    if (!slot.rawAnalysis) return;
    onUpdate(slot.id, {
      promptLang: language,
      currentPrompt: language === 'en' ? slot.rawAnalysis.prompt_en : slot.rawAnalysis.prompt_ko,
    });
  };

  const generate = async () => {
    if (!slot.currentPrompt.trim()) return;
    onUpdate(slot.id, { status: 'generating', error: null });
    try {
      const generated = await generateImageFromPrompt({ apiKey, prompt: slot.currentPrompt, settings });
      const completed: Slot = {
        ...slot,
        generatedImage: generated.base64,
        generatedMimeType: generated.mimeType,
        status: 'saving',
        error: null,
      };
      onUpdate(slot.id, completed);
      const id = await onSave(completed, slot.originalImage ? 'edit' : 'generation');
      onUpdate(slot.id, { status: 'idle', savedHistoryId: id });
    } catch (error) {
      onUpdate(slot.id, { status: 'error', error: error instanceof Error ? error.message : '이미지 생성에 실패했습니다.' });
    }
  };

  const saveCurrent = async () => {
    if (!slot.rawAnalysis || busy) return;
    onUpdate(slot.id, { status: 'saving', error: null });
    try {
      const id = await onSave(slot, slot.generatedImage ? 'edit' : 'analysis');
      onUpdate(slot.id, { status: 'idle', savedHistoryId: id });
    } catch (error) {
      onUpdate(slot.id, { status: 'error', error: error instanceof Error ? error.message : '히스토리에 저장하지 못했습니다.' });
    }
  };

  const download = (base64: string, mimeType: string | null) => {
    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
    const anchor = document.createElement('a');
    anchor.href = dataUrl(base64, mimeType);
    anchor.download = `nano-banana-${Date.now()}.${extension}`;
    anchor.click();
  };

  const copyText = async (kind: 'analysis' | 'prompt', text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1200);
  };

  const busy = ['analyzing', 'generating', 'saving'].includes(slot.status);

  return (
    <article
      className={`workspace-card ${dragging ? 'dragging' : ''}`}
      data-workspace-id={slot.id}
      onPointerDown={onActivate}
      onFocusCapture={onActivate}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (busy) return;
        const file = event.dataTransfer.files[0];
        if (file) void useFile(file);
      }}
    >
      <div className="workspace-titlebar">
        <div>
          <span className="workspace-index">{String(index + 1).padStart(2, '0')}</span>
          <span className="ml-3 text-sm font-medium text-slate-200">Analysis workspace</span>
        </div>
        <div className="flex items-center gap-2">
          {slot.trace && (
            <span className={`trace-chip trace-${slot.trace.agenticVisionStatus.toLowerCase()}`}>
              {agenticLabel(slot.trace.agenticVisionStatus)}
            </span>
          )}
          {canDelete && <button className="icon-button small" disabled={busy} onClick={() => onDelete(slot.id)} aria-label="작업 공간 삭제"><Trash2 size={14} /></button>}
        </div>
      </div>

      <div className="workspace-grid">
        <section className="workspace-pane image-pane">
          <div className="pane-heading-row">
            <div className="pane-heading"><span>01</span> 원본 이미지</div>
            {slot.originalImage && (
              <button className="text-action pane-action" disabled={busy} onClick={() => void runAnalysis(slot.originalImage!, slot.originalMimeType || 'image/png')}>
                <RefreshCw size={13} /> 다시 분석
              </button>
            )}
          </div>
          <div
            className="image-stage"
            role="button"
            tabIndex={0}
            onClick={() => !busy && !slot.originalImage && inputRef.current?.click()}
            onKeyDown={(event) => !busy && !slot.originalImage && event.key === 'Enter' && inputRef.current?.click()}
          >
            {slot.originalImage ? (
              <>
                <img src={dataUrl(slot.originalImage, slot.originalMimeType)} alt="분석 원본" />
                <div className="image-actions">
                  <button title="원본 크게 보기" aria-label="원본 크게 보기" onClick={(event) => { event.stopPropagation(); onOpenModal({ base64: slot.originalImage!, mimeType: slot.originalMimeType || 'image/png' }); }}><Expand size={15} /></button>
                  <button title="원본 다운로드" aria-label="원본 다운로드" onClick={(event) => { event.stopPropagation(); download(slot.originalImage!, slot.originalMimeType); }}><Download size={15} /></button>
                  <button title="원본 제거" aria-label="원본 제거" onClick={(event) => {
                    event.stopPropagation();
                    if (inputRef.current) inputRef.current.value = '';
                    onUpdate(slot.id, {
                      originalImage: null,
                      originalMimeType: null,
                      rawAnalysis: null,
                      trace: null,
                      report: null,
                      analysisText: '',
                      currentPrompt: '',
                      generatedImage: null,
                      generatedMimeType: null,
                      savedHistoryId: null,
                      status: 'idle',
                      error: null,
                    });
                  }}><X size={15} /></button>
                </div>
              </>
            ) : (
              <div className="upload-callout">
                <span className="upload-icon"><ImagePlus size={24} /></span>
                <strong>이미지를 놓거나 클릭하세요</strong>
                <small>붙여넣기 지원 · 원본 MIME 유지</small>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              hidden
              disabled={busy}
              onChange={(event) => {
                const file = takeSelectedFile(event.currentTarget);
                if (file) void useFile(file);
              }}
            />
          </div>

          {slot.trace && (
            <div className="trace-panel">
              <div className="flex items-center justify-between">
                <span>{slot.trace.pipeline === 'harness' ? 'Harness trace' : 'Standard trace'}</span>
                <b>{(slot.trace.totalDurationMs / 1000).toFixed(1)}s</b>
              </div>
              {slot.trace.stages.map((stage) => (
                <div className="trace-row" key={stage.name}><span>{stage.name}</span><span>{(stage.durationMs / 1000).toFixed(1)}s</span></div>
              ))}
            </div>
          )}
        </section>

        <section className="workspace-pane analysis-pane">
          <div className="pane-heading-row">
            <div className="pane-heading"><span>02</span> 분석 사양</div>
            <div className="pane-tools">
              <div className="segmented">
                <button className={slot.analysisLang === 'en' ? 'active' : ''} onClick={() => switchAnalysisLanguage('en')}>EN</button>
                <button className={slot.analysisLang === 'ko' ? 'active' : ''} onClick={() => switchAnalysisLanguage('ko')}>KO</button>
              </div>
              <button className="text-action pane-action" disabled={!slot.analysisText} onClick={() => void copyText('analysis', slot.analysisText)}>
                {copied === 'analysis' ? <Check size={13} /> : <Copy size={13} />}
                {copied === 'analysis' ? '복사됨' : '복사'}
              </button>
            </div>
          </div>
          <textarea
            className="analysis-editor"
            value={slot.analysisText}
            placeholder="이미지를 분석하면 상세 사양이 여기에 표시됩니다."
            onChange={(event) => onUpdate(slot.id, { analysisText: event.target.value })}
          />
        </section>

        <section className="workspace-pane output-pane">
          <div className="pane-heading-row">
            <div className="pane-heading"><span>03</span> 생성 프롬프트</div>
            <div className="segmented">
              <button className={slot.promptLang === 'en' ? 'active' : ''} onClick={() => switchPromptLanguage('en')}>EN</button>
              <button className={slot.promptLang === 'ko' ? 'active' : ''} onClick={() => switchPromptLanguage('ko')}>KO</button>
            </div>
          </div>
          <textarea
            className="prompt-editor"
            value={slot.currentPrompt}
            placeholder="추출된 생성 프롬프트"
            onChange={(event) => onUpdate(slot.id, { currentPrompt: event.target.value })}
          />
          <div className="flex gap-2">
            <button className="text-action" disabled={!slot.currentPrompt} onClick={() => void copyText('prompt', slot.currentPrompt)}>
              {copied === 'prompt' ? <Check size={14} /> : <Copy size={14} />}
              {copied === 'prompt' ? '복사됨' : '프롬프트 복사'}
            </button>
            <button className="text-action" disabled={!slot.rawAnalysis || busy} onClick={() => void saveCurrent()}>
              <Save size={14} /> 저장
            </button>
          </div>

          <button className="primary-button" disabled={!slot.currentPrompt.trim() || busy} onClick={() => void generate()}>
            {slot.status === 'generating' ? <LoaderCircle className="animate-spin" size={17} /> : <WandSparkles size={17} />}
            {slot.status === 'generating' ? '이미지 생성 중' : '프롬프트로 이미지 생성'}
          </button>

          <div className="generated-stage">
            {slot.generatedImage ? (
              <>
                <img src={dataUrl(slot.generatedImage, slot.generatedMimeType)} alt="생성 결과" />
                <div className="image-actions">
                  <button title="생성 이미지 크게 보기" aria-label="생성 이미지 크게 보기" onClick={() => onOpenModal({ base64: slot.generatedImage!, mimeType: slot.generatedMimeType || 'image/jpeg', prompt: slot.currentPrompt })}><Expand size={15} /></button>
                  <button title="생성 이미지 다운로드" aria-label="생성 이미지 다운로드" onClick={() => download(slot.generatedImage!, slot.generatedMimeType)}><Download size={15} /></button>
                </div>
              </>
            ) : (
              <span>생성 결과 미리보기</span>
            )}
          </div>
        </section>
      </div>

      {slot.report && <AnalysisReportView report={slot.report} />}

      {busy && (
        <div className="busy-overlay">
          <LoaderCircle className="animate-spin" size={24} />
          <span>{slot.status === 'analyzing' ? '이미지 분석 중' : slot.status === 'generating' ? '이미지 생성 중' : '히스토리에 저장 중'}</span>
        </div>
      )}
      {slot.error && (
        <div className="error-banner">
          <span>{slot.error}</span>
          {slot.originalImage && (
            <button
              className="text-action"
              disabled={busy}
              onClick={() => void runAnalysis(slot.originalImage!, slot.originalMimeType || 'image/png', slot.resumeState)}
            ><RefreshCw size={13} /> {slot.resumeState ? '실패 단계부터 재시도' : '수동 재시도'}</button>
          )}
          <button aria-label="오류 닫기" onClick={() => onUpdate(slot.id, { error: null, status: 'idle' })}><X size={15} /></button>
        </div>
      )}
    </article>
  );
}
