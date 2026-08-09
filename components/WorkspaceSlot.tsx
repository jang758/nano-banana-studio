import { useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Expand,
  FileText,
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
import { formatAnalysisReport, formatUsd } from '../utils/analysisReport';

interface Props {
  slot: Slot;
  index: number;
  settings: AppSettings;
  pipeline: AnalysisPipeline;
  apiKey: string;
  onUpdate: (id: string, updates: Partial<Slot>) => void;
  onSave: (slot: Slot, type: 'analysis' | 'generation' | 'edit') => Promise<string>;
  onOpenModal: (data: ModalData) => void;
  onDelete: (id: string) => void;
}

const dataUrl = (base64: string, mimeType: string | null) => `data:${mimeType || 'image/png'};base64,${base64}`;

const agenticLabel: Record<string, string> = {
  DISABLED: '정밀검사 꺼짐',
  AVAILABLE_NOT_USED: '정밀검사 불필요',
  USED_OK: '정밀검사 사용 완료',
  USED_FAILED: '정밀검사 실행 실패',
  UNSUPPORTED: '모델 미지원',
};

export function WorkspaceSlot({
  slot,
  index,
  settings,
  pipeline,
  apiKey,
  onUpdate,
  onSave,
  onOpenModal,
  onDelete,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState<'analysis' | 'prompt' | null>(null);

  const runAnalysis = async (base64: string, mimeType: string) => {
    onUpdate(slot.id, { status: 'analyzing', error: null, report: null });
    try {
      const output = await analyzeImage({
        apiKey,
        base64,
        mimeType,
        model: settings.analysisModel,
        pipeline,
        agenticVision: settings.agenticVision,
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
      };
      onUpdate(slot.id, completed);
      const id = await onSave(completed, 'analysis');
      onUpdate(slot.id, { status: 'idle', savedHistoryId: id });
    } catch (error) {
      onUpdate(slot.id, {
        status: 'error',
        error: error instanceof Error ? error.message : '분석에 실패했습니다.',
        report: error instanceof AnalysisRunError ? error.report : null,
      });
    }
  };

  const useFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      onUpdate(slot.id, { status: 'error', error: '이미지 파일만 사용할 수 있습니다.' });
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    await runAnalysis(base64, file.type || 'image/png');
  };

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

  const download = (base64: string, mimeType: string | null) => {
    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
    const anchor = document.createElement('a');
    anchor.href = dataUrl(base64, mimeType);
    anchor.download = `nano-banana-${Date.now()}.${extension}`;
    anchor.click();
  };

  const downloadReport = () => {
    if (!slot.report) return;
    const url = URL.createObjectURL(new Blob([formatAnalysisReport(slot.report)], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `nano-banana-report-${new Date(slot.report.createdAt).toISOString().replace(/[:.]/g, '-')}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
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
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) void useFile(file);
      }}
      onPaste={(event) => {
        const file = [...event.clipboardData.items].find((item) => item.type.startsWith('image/'))?.getAsFile();
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
              {agenticLabel[slot.trace.agenticVisionStatus]}
            </span>
          )}
          <button className="icon-button small" onClick={() => onDelete(slot.id)} aria-label="작업 공간 삭제"><Trash2 size={14} /></button>
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
            onClick={() => !slot.originalImage && inputRef.current?.click()}
            onKeyDown={(event) => event.key === 'Enter' && inputRef.current?.click()}
          >
            {slot.originalImage ? (
              <>
                <img src={dataUrl(slot.originalImage, slot.originalMimeType)} alt="분석 원본" />
                <div className="image-actions">
                  <button onClick={(event) => { event.stopPropagation(); onOpenModal({ base64: slot.originalImage!, mimeType: slot.originalMimeType || 'image/png' }); }}><Expand size={15} /></button>
                  <button onClick={(event) => { event.stopPropagation(); download(slot.originalImage!, slot.originalMimeType); }}><Download size={15} /></button>
                  <button onClick={(event) => { event.stopPropagation(); onUpdate(slot.id, { originalImage: null, originalMimeType: null, rawAnalysis: null, trace: null, report: null, analysisText: '', currentPrompt: '', generatedImage: null, savedHistoryId: null }); }}><X size={15} /></button>
                </div>
              </>
            ) : (
              <div className="upload-callout">
                <span className="upload-icon"><ImagePlus size={24} /></span>
                <strong>이미지를 놓거나 클릭하세요</strong>
                <small>붙여넣기 지원 · 원본 MIME 유지</small>
              </div>
            )}
            <input ref={inputRef} type="file" accept="image/*" hidden onChange={(event) => event.target.files?.[0] && void useFile(event.target.files[0])} />
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
            <button className="text-action" disabled={!slot.rawAnalysis || busy} onClick={() => void onSave(slot, slot.generatedImage ? 'edit' : 'analysis')}>
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
                  <button onClick={() => onOpenModal({ base64: slot.generatedImage!, mimeType: slot.generatedMimeType || 'image/jpeg', prompt: slot.currentPrompt })}><Expand size={15} /></button>
                  <button onClick={() => download(slot.generatedImage!, slot.generatedMimeType)}><Download size={15} /></button>
                </div>
              </>
            ) : (
              <span>생성 결과 미리보기</span>
            )}
          </div>
        </section>
      </div>

      {slot.report && (
        <details className={`analysis-report ${slot.report.outcome !== 'completed' ? 'report-failed' : ''}`}>
          <summary>
            <span><FileText size={15} /> 분석 실행 리포트</span>
            <span className="report-summary">
              <b>{slot.report.requestedModel}</b>
              <i>{agenticLabel[slot.report.agenticVisionStatus]}</i>
              <i>{slot.report.inspections.length}회 정밀검사</i>
              <i>{formatUsd(slot.report.cost.totalUsd)}</i>
              <i>{(slot.report.totalDurationMs / 1000).toFixed(2)}s</i>
            </span>
          </summary>
          <div className="report-body">
            <div className="report-metrics">
              <span><small>실행 결과</small><b>{slot.report.outcome}</b></span>
              <span><small>선택 / 실행 모델</small><b>{slot.report.requestedModel}<br />{slot.report.resolvedModels.join(', ') || '응답 없음'}</b></span>
              <span><small>Agentic Vision 직접 귀속 추정</small><b>{formatUsd(slot.report.cost.agenticAttributedUsd)}</b></span>
              <span><small>토큰 / 시간</small><b>{slot.report.usage.totalTokens.toLocaleString()} / {(slot.report.totalDurationMs / 1000).toFixed(2)}s</b></span>
            </div>
            {slot.report.failure && (
              <div className="report-failure">
                <b>{slot.report.failure.stage} 단계에서 중단됨</b>
                <span>{slot.report.failure.reason}</span>
              </div>
            )}
            {slot.report.inspections.length > 0 && (
              <div className="inspection-grid">
                {slot.report.inspections.map((inspection) => (
                  <div key={`${inspection.index}-${inspection.area}`}>
                    <b>검사 {inspection.index} · {inspection.area}</b>
                    <span>{inspection.purpose}</span>
                    <small>{inspection.resultExcerpt || '텍스트 결과 없음'}</small>
                  </div>
                ))}
              </div>
            )}
            <button className="secondary-button report-download" onClick={downloadReport}>
              <Download size={14} /> 리포트 .md 저장
            </button>
            <pre>{formatAnalysisReport(slot.report)}</pre>
          </div>
        </details>
      )}

      {busy && (
        <div className="busy-overlay">
          <LoaderCircle className="animate-spin" size={24} />
          <span>{slot.status === 'analyzing' ? '이미지 분석 중' : slot.status === 'generating' ? '이미지 생성 중' : '히스토리에 저장 중'}</span>
        </div>
      )}
      {slot.error && <div className="error-banner">{slot.error}</div>}
    </article>
  );
}
