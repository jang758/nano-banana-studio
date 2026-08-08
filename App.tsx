
import React, { useState, useEffect, useCallback } from 'react';
import { HistorySidebar } from './components/HistorySidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { WorkspaceSlot } from './components/WorkspaceSlot';
import { ImageModal } from './components/ImageModal';
import { AppSettings, HistoryItem, WorkspaceSlot as IWorkspaceSlot, ModalData } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { getHistoryMetadata, getFullHistoryItem, saveHistoryItem, deleteHistoryItem, clearAllHistory } from './services/storageService';
import { Menu, Settings as SettingsIcon, LifeBuoy, AlertTriangle, Plus } from 'lucide-react';

const INITIAL_SLOTS: IWorkspaceSlot[] = Array.from({ length: 3 }, (_, i) => ({
  id: Date.now() + i,
  originalImage: null,
  generatedImage: null,
  analysisText: '',
  analysisLang: 'en',
  currentPrompt: '',
  promptLang: 'en',
  status: 'idle',
  error: null,
  rawAnalysis: null
}));

export default function App() {
  const [historyMeta, setHistoryMeta] = useState<Partial<HistoryItem>[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [slots, setSlots] = useState<IWorkspaceSlot[]>(INITIAL_SLOTS);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [memWarning, setMemWarning] = useState(false);

  useEffect(() => {
    const loadMetadata = async () => {
      const meta = await getHistoryMetadata();
      setHistoryMeta(meta);
    };
    loadMetadata();

    // 메모리 모니터링 (지원 브라우저)
    const checkMem = () => {
      if ((performance as any).memory) {
        const { usedJSHeapSize, jsHeapSizeLimit } = (performance as any).memory;
        if (usedJSHeapSize > jsHeapSizeLimit * 0.8) setMemWarning(true);
      }
    };
    const timer = setInterval(checkMem, 5000);
    return () => clearInterval(timer);
  }, []);

  const updateSlot = useCallback((id: number, updates: Partial<IWorkspaceSlot>) => {
    setSlots(prev => prev.map(slot => slot.id === id ? { ...slot, ...updates } : slot));
  }, []);

  const addSlot = () => {
    const newSlot: IWorkspaceSlot = {
      id: Date.now(),
      originalImage: null,
      generatedImage: null,
      analysisText: '',
      analysisLang: 'en',
      currentPrompt: '',
      promptLang: 'en',
      status: 'idle',
      error: null,
      rawAnalysis: null
    };
    setSlots(prev => [...prev, newSlot]);
  };

  const removeSlot = (id: number) => {
    if (slots.length <= 1) {
      alert("At least one workspace must remain.");
      return;
    }
    setSlots(prev => prev.filter(s => s.id !== id));
  };

  const saveSlotToHistory = async (slot: IWorkspaceSlot) => {
     if (!slot.generatedImage) return;
     const newItem: HistoryItem = {
        id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        timestamp: Date.now(),
        originalImageBase64: slot.originalImage || undefined,
        generatedImageBase64: slot.generatedImage,
        promptUsed: slot.currentPrompt,
        analysis: slot.rawAnalysis || undefined,
        settings: { ...settings },
        type: slot.originalImage ? 'edit' : 'generation'
      };
      
      try {
        await saveHistoryItem(newItem);
        setHistoryMeta(prev => [{ id: newItem.id, timestamp: newItem.timestamp, promptUsed: newItem.promptUsed, type: newItem.type }, ...prev]);
      } catch (e) {
        alert("이미지 저장 실패: 용량이 부족할 수 있습니다.");
      }
  };

  const loadHistoryItem = async (id: string) => {
    const item = await getFullHistoryItem(id);
    if (!item) return;

    const targetId = slots.findIndex(s => !s.generatedImage) !== -1 ? slots.findIndex(s => !s.generatedImage) : 0;
    const slotToUpdate = slots[targetId] || slots[0];
    
    updateSlot(slotToUpdate.id, {
       originalImage: item.originalImageBase64 || null,
       generatedImage: item.generatedImageBase64 || null,
       currentPrompt: item.promptUsed,
       rawAnalysis: item.analysis || null,
       status: 'idle'
    });
    setSidebarOpen(false);
  };

  const handleEmergencyRescue = () => {
    const imgs = Array.from(document.querySelectorAll('img')).filter(i => i.src.startsWith('data:image'));
    if (imgs.length === 0) return alert("추출할 이미지가 없습니다.");
    imgs.forEach((img, i) => {
      const a = document.createElement('a');
      a.href = img.src;
      a.download = `rescue_${i+1}.png`;
      a.click();
    });
    alert(`${imgs.length}개 이미지 추출 시도!`);
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden font-sans">
      <HistorySidebar 
        historyMetadata={historyMeta}
        onSelect={loadHistoryItem}
        onDelete={async (id) => { await deleteHistoryItem(id); setHistoryMeta(prev => prev.filter(m => m.id !== id)); }}
        onClear={async () => { if(confirm("Clear all?")) { await clearAllHistory(); setHistoryMeta([]); } }}
        isOpen={isSidebarOpen}
        setIsOpen={setSidebarOpen}
        onOpenModal={setModalData}
      />

      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {memWarning && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white px-4 py-1 rounded-full text-xs font-bold flex items-center gap-2 animate-pulse shadow-lg">
            <AlertTriangle size={14} /> HIGH MEMORY DETECTED - PLEASE EXPORT & CLEAR HISTORY
          </div>
        )}

        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/80 backdrop-blur-md z-30">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 hover:bg-zinc-800 rounded"><Menu size={20}/></button>
            <div className="flex items-center gap-2">
               <div className="w-8 h-8 bg-yellow-500 rounded flex items-center justify-center text-black font-black">N</div>
               <h1 className="font-bold text-lg hidden sm:block italic">NANO BANANA <span className="text-[10px] text-zinc-500 font-normal">STABILITY v4.0</span></h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={addSlot}
              className="hidden sm:flex items-center gap-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            >
              <Plus size={14} /> ADD WORKSPACE
            </button>
            <button onClick={handleEmergencyRescue} title="Emergency Rescue" className="p-2 text-zinc-500 hover:text-red-500 transition-colors">
               <LifeBuoy size={20} />
            </button>
            <button onClick={() => setSettingsOpen(true)} className="p-2 hover:bg-zinc-800 rounded lg:hidden"><SettingsIcon size={20}/></button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900/20 via-zinc-950 to-zinc-950">
          <div className="max-w-6xl mx-auto space-y-6">
            {slots.map((slot, idx) => (
               <WorkspaceSlot 
                  key={slot.id} index={idx} slot={slot} settings={settings} 
                  onUpdate={updateSlot} onSaveToHistory={saveSlotToHistory} onOpenModal={setModalData}
                  onDelete={removeSlot}
               />
            ))}
            
            <button 
              onClick={addSlot}
              className="w-full py-12 border-2 border-dashed border-zinc-800 rounded-xl text-zinc-600 hover:text-yellow-500 hover:border-yellow-500/50 hover:bg-yellow-500/5 transition-all flex flex-col items-center justify-center gap-3 group mb-20"
            >
              <Plus size={32} className="group-hover:scale-110 transition-transform" />
              <span className="font-bold uppercase tracking-widest text-sm">Add New Workspace Slot</span>
            </button>
          </div>
        </main>
      </div>

      <SettingsPanel settings={settings} setSettings={setSettings} isOpen={isSettingsOpen} setIsOpen={setSettingsOpen} />
      <ImageModal isOpen={!!modalData} onClose={() => setModalData(null)} data={modalData} />
    </div>
  );
}
