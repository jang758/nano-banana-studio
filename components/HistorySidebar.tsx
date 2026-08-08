
import React, { useState, useEffect } from 'react';
import { HistoryItem, ModalData } from '../types';
import { Trash2, Download, History, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { getFullHistoryItem } from '../services/storageService';

interface HistorySidebarProps {
  historyMetadata: Partial<HistoryItem>[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onOpenModal: (data: ModalData) => void;
}

// Added explicit interface for HistoryCard props to fix JSX 'key' property error
interface HistoryCardProps {
  item: Partial<HistoryItem>;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenModal: (data: ModalData) => void;
}

// 개별 히스토리 아이템 컴포넌트 (이미지 로딩 최적화)
// Fixed typing using React.FC to avoid 'key' property error during map()
const HistoryCard: React.FC<HistoryCardProps> = ({ item, onSelect, onDelete, onOpenModal }) => {
  const [imgData, setImgData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 사이드바가 열려있을 때만 이미지 로드 시도
    let isMounted = true;
    const loadThumb = async () => {
      if (!item.id) return;
      setLoading(true);
      const fullItem = await getFullHistoryItem(item.id);
      if (isMounted && fullItem) {
        setImgData(fullItem.generatedImageBase64 || fullItem.originalImageBase64 || null);
      }
      setLoading(false);
    };
    loadThumb();
    return () => { isMounted = false; };
  }, [item.id]);

  return (
    <div 
      className="group relative bg-zinc-800/30 hover:bg-zinc-800 rounded-lg p-2 cursor-pointer border border-transparent hover:border-yellow-500/30 transition-all"
      onClick={() => item.id && onSelect(item.id)}
    >
      <div className="flex gap-2">
        <div 
          className="w-16 h-16 bg-zinc-950 rounded overflow-hidden flex-shrink-0 relative flex items-center justify-center border border-zinc-800"
          onClick={(e) => { 
            e.stopPropagation(); 
            if (imgData) onOpenModal({ base64: imgData, prompt: item.promptUsed });
          }}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin text-zinc-700" />
          ) : imgData ? (
            <img src={`data:image/png;base64,${imgData}`} className="w-full h-full object-cover" alt="Thumb" />
          ) : (
            <ImageIcon size={16} className="text-zinc-800" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-zinc-500 truncate">
            {item.timestamp ? new Date(item.timestamp).toLocaleString() : ''}
          </p>
          <p className="text-xs text-zinc-300 line-clamp-2 mt-1 leading-snug">
            {item.promptUsed}
          </p>
        </div>
      </div>
      <button 
        onClick={(e) => { e.stopPropagation(); item.id && onDelete(item.id); }}
        className="absolute top-1 right-1 p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
};

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  historyMetadata,
  onSelect,
  onDelete,
  onClear,
  isOpen,
  setIsOpen,
  onOpenModal
}) => {
  const [isZipping, setIsZipping] = useState(false);

  const downloadAll = async () => {
    if (historyMetadata.length === 0) return;
    setIsZipping(true);
    try {
      const zip = new window.JSZip();
      for (const meta of historyMetadata) {
        if (!meta.id) continue;
        const item = await getFullHistoryItem(meta.id);
        if (!item) continue;
        
        const dateStr = new Date(item.timestamp).toISOString().replace(/[:.]/g, '-');
        const folder = zip.folder(`item_${item.id.slice(-4)}_${dateStr}`);
        folder.file("prompt.txt", item.promptUsed);
        if (item.generatedImageBase64) folder.file("generated.png", item.generatedImageBase64, { base64: true });
        // 메모리 방전을 방지하기 위한 틱
        await new Promise(r => setTimeout(r, 0));
      }
      const content = await zip.generateAsync({ type: "blob" });
      window.saveAs(content, `backup_${Date.now()}.zip`);
    } catch (err) {
      alert("압축 중 메모리 오류가 발생했습니다. 개별 저장을 이용하세요.");
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm" onClick={() => setIsOpen(false)} />}
      <div className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-zinc-900 border-r border-zinc-800 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
            <h2 className="text-lg font-bold text-yellow-500 flex items-center gap-2 italic">
              <History size={18} /> HISTORY
            </h2>
            <button onClick={() => setIsOpen(false)} className="lg:hidden text-zinc-500 hover:text-white"><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-black/20">
            {historyMetadata.length === 0 ? (
              <div className="text-zinc-600 text-center py-20 text-sm">No items found</div>
            ) : (
              historyMetadata.map((item) => (
                <HistoryCard key={item.id} item={item} onSelect={onSelect} onDelete={onDelete} onOpenModal={onOpenModal} />
              ))
            )}
          </div>
          <div className="p-4 border-t border-zinc-800 space-y-2 bg-zinc-900">
            <button onClick={downloadAll} disabled={isZipping} className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50">
              {isZipping ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} ZIP EXPORT
            </button>
            <button onClick={onClear} className="w-full flex items-center justify-center gap-2 text-red-500/70 hover:text-red-400 py-2 text-xs transition-colors">
              <Trash2 size={14} /> Clear DB
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
