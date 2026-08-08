import React from 'react';
import { X, Copy, Image as ImageIcon } from 'lucide-react';
import { ModalData } from '../types';

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ModalData | null;
}

export const ImageModal: React.FC<ImageModalProps> = ({ isOpen, onClose, data }) => {
  if (!isOpen || !data) return null;

  /**
   * 다른 제미나이가 제안한 '캔버스 우회 기술'을 적용한 복사 함수
   * 브라우저 메모리에 이미지를 직접 그려서 '순수 데이터'로 변환 후 클립보드에 주입합니다.
   */
  const copyImage = async () => {
    try {
      const img = new Image();
      // 이미지 로드 시작
      img.src = `data:image/png;base64,${data.base64}`;
      
      // 최신 브라우저의 decode() 메서드를 사용하여 로딩 대기
      await img.decode();

      // 1. 투명 도화지(Canvas) 준비
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) throw new Error("Canvas context를 생성할 수 없습니다.");

      // 2. 도화지에 이미지 직접 그리기 (브라우저가 직접 만든 데이터로 인식하게 함)
      ctx.drawImage(img, 0, 0);

      // 3. 브라우저표 '순수 데이터(Blob)' 추출 및 클립보드 강제 주입
      canvas.toBlob(async (blob) => {
        if (!blob) throw new Error("Blob 생성에 실패했습니다.");
        
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          alert("이미지가 클립보드에 복사되었습니다! (Canvas 우회 방식 적용)");
        } catch (clipErr) {
          console.error("Clipboard write error:", clipErr);
          alert("클립보드 쓰기 권한이 거부되었거나 지원되지 않는 브라우저입니다.");
        }
      }, 'image/png');
      
    } catch (e: any) {
      console.error("복사 실패:", e);
      alert(`이미지 복사 중 오류가 발생했습니다: ${e.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      
      <div 
        className="relative bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col md:flex-row overflow-hidden" 
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 bg-black/50 text-white/70 hover:text-white p-2 rounded-full backdrop-blur-sm transition-colors"
        >
          <X size={20} />
        </button>

        {/* Image Section */}
        <div className="flex-1 bg-black/50 flex items-center justify-center p-4 min-h-[300px] relative group">
           <img 
             src={`data:image/png;base64,${data.base64}`} 
             className="max-w-full max-h-full object-contain"
             alt="Full Size"
           />
           <button 
             onClick={copyImage}
             className="absolute bottom-6 right-6 bg-zinc-800/80 hover:bg-zinc-700 text-white px-3 py-2 rounded-lg backdrop-blur-sm flex items-center gap-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
           >
             <ImageIcon size={16} /> Copy Image
           </button>
        </div>

        {/* Prompt Section (if available) */}
        {data.prompt && (
          <div className="w-full md:w-[400px] border-l border-zinc-800 flex flex-col bg-zinc-900/95">
             <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
                <h3 className="font-bold text-zinc-200">Used Prompt</h3>
                <button 
                  onClick={() => navigator.clipboard.writeText(data.prompt!)}
                  className="text-xs flex items-center gap-1 text-zinc-400 hover:text-white bg-zinc-800 px-2 py-1 rounded transition-colors"
                >
                  <Copy size={12} /> Copy Text
                </button>
             </div>
             <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
                <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {data.prompt}
                </p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};