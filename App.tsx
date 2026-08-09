import { useCallback, useEffect, useMemo, useState } from 'react';
import { HistorySidebar } from './components/HistorySidebar';
import { ImageModal } from './components/ImageModal';
import { SettingsPanel } from './components/SettingsPanel';
import { WorkspaceSlot } from './components/WorkspaceSlot';
import { DEFAULT_SETTINGS, FALLBACK_MODELS } from './constants';
import { listAvailableModels } from './services/geminiService';
import {
  clearAllHistory,
  deleteHistoryItem,
  getFullHistoryItem,
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
  WorkspaceSlot as WorkspaceSlotType,
} from './types';
import { formatAnalysis } from './utils/analysisFormat';
import { Columns2, History, Plus, Settings, Sparkles } from 'lucide-react';

function newSlot(): WorkspaceSlotType {
  return {
    id: crypto.randomUUID(),
    originalImage: null,
    originalMimeType: null,
    generatedImage: null,
    generatedMimeType: null,
    analysisText: '',
    analysisLang: 'en',
    currentPrompt: '',
    promptLang: 'en',
    status: 'idle',
    error: null,
    rawAnalysis: null,
    trace: null,
    report: null,
    savedHistoryId: null,
  };
}

function mergeModels(liveModels: ModelOption[]): ModelOption[] {
  const byId = new Map<string, ModelOption>();
  FALLBACK_MODELS.forEach((model) => byId.set(model.id, model));
  liveModels.forEach((model) => byId.set(model.id, model));
  return [...byId.values()].sort((a, b) => a.task.localeCompare(b.task) || a.displayName.localeCompare(b.displayName));
}

export default function App({ pipeline }: { pipeline: AnalysisPipeline }) {
  const [apiKey, setApiKey] = useState('');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const [modelRefreshState, setModelRefreshState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [slots, setSlots] = useState<WorkspaceSlotType[]>([newSlot()]);
  const [history, setHistory] = useState<HistoryMetadata[]>([]);
  const [nextBefore, setNextBefore] = useState<number | undefined>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [notice, setNotice] = useState('');

  const modeLabel = pipeline === 'standard' ? '기존 분석 유지' : '새 분석 하네스';

  const loadFirstHistoryPage = useCallback(async () => {
    const page = await getHistoryPage();
    setHistory(page.items);
    setNextBefore(page.nextBefore);
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
  }, []);

  const saveSlot = useCallback(async (
    slot: WorkspaceSlotType,
    type: 'analysis' | 'generation' | 'edit',
  ): Promise<string> => {
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

  const refreshModels = useCallback(async () => {
    setModelRefreshState('loading');
    try {
      const live = await listAvailableModels(apiKey);
      setModels(mergeModels(live));
      setModelRefreshState('idle');
      setNotice(`API가 제공한 모델 ${live.length}개를 불러왔습니다.`);
    } catch (error) {
      setModelRefreshState('error');
      setNotice(error instanceof Error ? error.message : '모델 목록을 불러오지 못했습니다.');
    }
  }, [apiKey]);

  const selectableCounts = useMemo(() => ({
    analysis: models.filter((model) => model.task === 'analysis' && model.selectable).length,
    image: models.filter((model) => model.task === 'image' && model.selectable).length,
    total: models.length,
  }), [models]);

  return (
    <div className="app-shell">
      <HistorySidebar
        items={history}
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
        }}
        onClear={async () => {
          await clearAllHistory();
          setHistory([]);
          setNextBefore(undefined);
        }}
      />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-white/8 bg-[#090b0f]/88 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1800px] items-center gap-3 px-4 lg:px-6">
            <button className="icon-button lg:hidden" onClick={() => setHistoryOpen(true)} aria-label="히스토리 열기">
              <History size={18} />
            </button>
            <a href="/" className="flex items-center gap-3">
              <span className="brand-mark"><Sparkles size={18} /></span>
              <span className="hidden font-semibold tracking-tight sm:block">Nano Banana Studio</span>
            </a>
            <span className={`mode-badge ${pipeline === 'harness' ? 'mode-badge-harness' : ''}`}>{modeLabel}</span>
            <nav className="ml-auto hidden items-center gap-1 xl:flex">
              <a className={pipeline === 'standard' ? 'nav-pill active' : 'nav-pill'} href="/">기존 분석</a>
              <a className={pipeline === 'harness' ? 'nav-pill active' : 'nav-pill'} href="/harness.html">새 하네스</a>
              <a className="nav-pill" href="/compare.html"><Columns2 size={14} /> 비교</a>
            </nav>
            <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="설정 열기">
              <Settings size={18} />
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1800px] px-4 py-5 lg:px-6 lg:py-7">
          <section className="mb-5 grid gap-3 xl:grid-cols-[1fr_auto]">
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
            <div className="metric-strip">
              <span><b>{selectableCounts.analysis}</b> 분석</span>
              <span><b>{selectableCounts.image}</b> 생성</span>
              <span><b>{selectableCounts.total}</b> 전체 모델</span>
            </div>
          </section>

          {notice && (
            <button className="notice" onClick={() => setNotice('')} title="닫기">{notice}</button>
          )}

          <div className="space-y-5">
            {slots.map((slot, index) => (
              <WorkspaceSlot
                key={slot.id}
                index={index}
                slot={slot}
                settings={settings}
                pipeline={pipeline}
                apiKey={apiKey}
                onUpdate={updateSlot}
                onSave={saveSlot}
                onOpenModal={setModalData}
                onDelete={(id) => setSlots((current) => current.length === 1 ? current : current.filter((item) => item.id !== id))}
              />
            ))}
          </div>

          <button className="add-workspace" onClick={() => setSlots((current) => [...current, newSlot()])}>
            <Plus size={19} /> 새 작업 공간 추가
          </button>
        </main>
      </div>

      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        models={models}
        modelRefreshState={modelRefreshState}
        onRefreshModels={refreshModels}
      />
      <ImageModal data={modalData} onClose={() => setModalData(null)} />
    </div>
  );
}
