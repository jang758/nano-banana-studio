import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { HistorySidebar } from './components/HistorySidebar';
import { ImageModal } from './components/ImageModal';
import { SettingsPanel } from './components/SettingsPanel';
import { WorkspaceSlot } from './components/WorkspaceSlot';
import {
  clearAllHistory,
  deleteHistoryItem,
  getFullHistoryItem,
  getHistoryCount,
  getHistoryPage,
  migrateLegacyHistory,
  saveHistoryItem,
  searchHistory,
} from './services/storageService';
import type {
  AnalysisPipeline,
  AppSettings,
  HistoryMetadata,
  ModalData,
  ModelOption,
  PipelineWorkspaceSession,
  StudioView,
  WorkspaceSlot as WorkspaceSlotType,
} from './types';
import { formatAnalysis } from './utils/analysisFormat';
import { createWorkspaceSlot } from './utils/studioState';
import { Columns2, History, Plus, Settings, Sparkles } from 'lucide-react';

interface Props {
  pipeline: AnalysisPipeline;
  view: StudioView;
  onNavigate: (view: StudioView) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  models: ModelOption[];
  modelRefreshState: 'idle' | 'loading' | 'error';
  onRefreshModels: () => Promise<number>;
  session: PipelineWorkspaceSession;
  onSessionChange: Dispatch<SetStateAction<PipelineWorkspaceSession>>;
}

export default function App({
  pipeline,
  view,
  onNavigate,
  apiKey,
  onApiKeyChange,
  settings,
  onSettingsChange,
  models,
  modelRefreshState,
  onRefreshModels,
  session,
  onSessionChange,
}: Props) {
  const { slots, activeSlotId } = session;
  const [history, setHistory] = useState<HistoryMetadata[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [nextBefore, setNextBefore] = useState<number | undefined>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [notice, setNotice] = useState('');

  const setSlots = useCallback((updater: SetStateAction<WorkspaceSlotType[]>) => {
    onSessionChange((current) => ({
      ...current,
      slots: typeof updater === 'function' ? updater(current.slots) : updater,
    }));
  }, [onSessionChange]);

  const setActiveSlotId = useCallback((id: string | null) => {
    onSessionChange((current) => ({ ...current, activeSlotId: id }));
  }, [onSessionChange]);

  const modeLabel = pipeline === 'standard' ? '기존 분석 유지' : '새 분석 하네스';
  const pasteTargetId = activeSlotId && slots.some((slot) => slot.id === activeSlotId)
    ? activeSlotId
    : (slots.find((slot) => slot.status === 'idle' && !slot.originalImage)?.id ?? slots[0]?.id ?? null);

  const loadFirstHistoryPage = useCallback(async () => {
    const [page, total] = await Promise.all([getHistoryPage(), getHistoryCount()]);
    setHistory(page.items);
    setNextBefore(page.nextBefore);
    setHistoryTotal(total);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const migrated = await migrateLegacyHistory();
        if (!active) return;
        await loadFirstHistoryPage();
        if (migrated) setNotice(`기존 히스토리 ${migrated}개를 새 저장소로 복사했습니다.`);
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : '히스토리를 불러오지 못했습니다.');
      }
    })();
    return () => { active = false; };
  }, [loadFirstHistoryPage]);

  const updateSlot = useCallback((id: string, updates: Partial<WorkspaceSlotType>) => {
    setSlots((current) => current.map((slot) => slot.id === id ? { ...slot, ...updates } : slot));
  }, [setSlots]);

  const saveSlot = useCallback(async (
    slot: WorkspaceSlotType,
    type: 'analysis' | 'generation' | 'edit',
  ): Promise<string> => {
    const isNew = !slot.savedHistoryId;
    const metadata = await saveHistoryItem({
      id: slot.savedHistoryId || undefined,
      originalImage: slot.originalImage,
      originalMimeType: slot.originalMimeType,
      generatedImage: slot.generatedImage,
      generatedMimeType: slot.generatedMimeType,
      promptUsed: slot.currentPrompt,
      analysis: slot.rawAnalysis,
      analysisText: slot.analysisText,
      analysisLang: slot.analysisLang,
      promptLang: slot.promptLang,
      trace: slot.trace,
      report: slot.report,
      settings: { ...settings },
      pipeline,
      type,
    });
    setHistory((current) => [metadata, ...current.filter((item) => item.id !== metadata.id)]);
    if (isNew) setHistoryTotal((current) => current + 1);
    updateSlot(slot.id, { savedHistoryId: metadata.id });
    return metadata.id;
  }, [pipeline, settings, updateSlot]);

  const loadHistoryItem = useCallback(async (id: string) => {
    const item = await getFullHistoryItem(id);
    if (!item) return;
    const target = slots.find((slot) => slot.status === 'idle' && !slot.originalImage) ?? slots[0];
    updateSlot(target.id, {
      originalImage: item.originalImageBase64 ?? null,
      originalMimeType: item.originalMimeType ?? null,
      generatedImage: item.generatedImageBase64 ?? null,
      generatedMimeType: item.generatedMimeType ?? null,
      analysisText: item.analysisText || (item.analysis ? formatAnalysis(item.analysis, item.analysisLang) : ''),
      analysisLang: item.analysisLang,
      currentPrompt: item.promptUsed,
      promptLang: item.promptLang,
      rawAnalysis: item.analysis ?? null,
      trace: item.trace ?? null,
      report: item.report ?? null,
      savedHistoryId: item.id,
      status: 'idle',
      error: null,
    });
    setHistoryOpen(false);
  }, [slots, updateSlot]);

  const navigationDisabled = slots.some((slot) => ['analyzing', 'generating', 'saving'].includes(slot.status));

  return (
    <div className="app-shell">
      <HistorySidebar
        items={history}
        totalItems={historyTotal}
        isOpen={historyOpen}
        hasMore={nextBefore !== undefined}
        onClose={() => setHistoryOpen(false)}
        onSelect={loadHistoryItem}
        onLoadMore={async () => {
          if (nextBefore === undefined) return;
          const page = await getHistoryPage(60, nextBefore);
          setHistory((current) => [...current, ...page.items]);
          setNextBefore(page.nextBefore);
        }}
        onSearch={async (query) => {
          if (!query.trim()) return loadFirstHistoryPage();
          setHistory(await searchHistory(query));
          setNextBefore(undefined);
        }}
        onDelete={async (id) => {
          await deleteHistoryItem(id);
          setHistory((current) => current.filter((item) => item.id !== id));
          setHistoryTotal((current) => Math.max(0, current - 1));
        }}
        onClear={async () => {
          await clearAllHistory();
          setHistory([]);
          setHistoryTotal(0);
          setNextBefore(undefined);
        }}
      />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-white/8 bg-[#090b0f]/88 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-3 px-4 lg:px-5">
            <button className="icon-button lg:hidden" onClick={() => setHistoryOpen(true)} aria-label="히스토리 열기">
              <History size={18} />
            </button>
            <button className="brand-button flex items-center gap-3" disabled={navigationDisabled} onClick={() => onNavigate('standard')}>
              <span className="brand-mark"><Sparkles size={18} /></span>
              <span className="hidden font-semibold tracking-tight sm:block">Nano Banana Studio</span>
            </button>
            <span className={`mode-badge ${pipeline === 'harness' ? 'mode-badge-harness' : ''}`}>{modeLabel}</span>
            <nav className="ml-auto hidden items-center gap-1 xl:flex">
              <button disabled={navigationDisabled} className={pipeline === 'standard' ? 'nav-pill active' : 'nav-pill'} onClick={() => onNavigate('standard')}>기존 분석</button>
              <button disabled={navigationDisabled} className={pipeline === 'harness' ? 'nav-pill active' : 'nav-pill'} onClick={() => onNavigate('harness')}>새 하네스</button>
              <button disabled={navigationDisabled} className="nav-pill" onClick={() => onNavigate('compare')}><Columns2 size={14} /> 비교</button>
            </nav>
            <select
              className="view-switch-mobile ml-auto xl:hidden"
              aria-label="분석 화면 선택"
              value={view}
              disabled={navigationDisabled}
              onChange={(event) => onNavigate(event.target.value as StudioView)}
            >
              <option value="standard">기존 분석</option>
              <option value="harness">새 하네스</option>
              <option value="compare">비교</option>
            </select>
            <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="설정 열기">
              <Settings size={18} />
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1800px] px-4 py-4 lg:px-5 lg:py-5">
          <section className="mb-4">
            <div>
              <p className="eyebrow">IMAGE → ANALYSIS → RECONSTRUCTION</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white lg:text-3xl">
                {pipeline === 'standard' ? '원래 분석 방식 그대로, 기반만 최신화' : '증거와 비평을 거치는 정밀 분석 하네스'}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                {pipeline === 'standard'
                  ? '기존 시스템 프롬프트·JSON 스키마·1회 분석 흐름을 보존한 비교 기준 버전입니다.'
                  : 'Agentic Vision 없이도 완결되는 증거 수집 → 교차 비평 → 최종 합성 파이프라인입니다.'}
              </p>
            </div>
          </section>

          {notice && (
            <button className="notice" onClick={() => setNotice('')} title="닫기">{notice}</button>
          )}

          <div className="space-y-4">
            {slots.map((slot, index) => (
              <WorkspaceSlot
                key={slot.id}
                index={index}
                slot={slot}
                settings={settings}
                pipeline={pipeline}
                apiKey={apiKey}
                isPasteTarget={slot.id === pasteTargetId}
                onActivate={() => setActiveSlotId(slot.id)}
                onUpdate={updateSlot}
                onSave={saveSlot}
                onOpenModal={setModalData}
                onDelete={(id) => setSlots((current) => current.length === 1 ? current : current.filter((item) => item.id !== id))}
                canDelete={slots.length > 1}
              />
            ))}
          </div>

          <button className="add-workspace" onClick={() => {
            const slot = createWorkspaceSlot();
            setSlots((current) => [...current, slot]);
            setActiveSlotId(slot.id);
          }}>
            <Plus size={19} /> 새 작업 공간 추가
          </button>
        </main>
      </div>

      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={onSettingsChange}
        apiKey={apiKey}
        onApiKeyChange={onApiKeyChange}
        models={models}
        modelRefreshState={modelRefreshState}
        onRefreshModels={() => {
          void onRefreshModels()
            .then((count) => setNotice(`API가 제공한 모델 ${count}개를 불러왔습니다.`))
            .catch((error) => setNotice(error instanceof Error ? error.message : '모델 목록을 불러오지 못했습니다.'));
        }}
      />
      <ImageModal data={modalData} onClose={() => setModalData(null)} />
    </div>
  );
}
