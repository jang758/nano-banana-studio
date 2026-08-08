
import React, { useRef, useState, useEffect } from 'react';
import { WorkspaceSlot as IWorkspaceSlot, AppSettings, AnalysisResult, ModalData } from '../types';
import { Upload, X, Wand2, Copy, Download, Loader2, Maximize2, Trash2, RefreshCw } from 'lucide-react';
import { analyzeImage, generateImageFromPrompt } from '../services/geminiService';

interface WorkspaceSlotProps {
  slot: IWorkspaceSlot;
  index: number;
  settings: AppSettings;
  onUpdate: (id: number, updates: Partial<IWorkspaceSlot>) => void;
  onSaveToHistory: (slot: IWorkspaceSlot) => void;
  onOpenModal: (data: ModalData) => void;
  onDelete: (id: number) => void;
}

export const WorkspaceSlot: React.FC<WorkspaceSlotProps> = ({ 
  slot, 
  index, 
  settings, 
  onUpdate, 
  onSaveToHistory,
  onOpenModal,
  onDelete
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const formatAnalysis = (r: AnalysisResult, lang: 'en' | 'ko'): string => {
    const titles = lang === 'ko' ? {
      face: "1. 안면 기하학 및 피하 분석 (Face Geometry/Subdermal)",
      expr: "2. 안면 근육 긴장 및 표정 (Expression Physics)",
      body: "3. 쓰리사이즈 및 신체 수치 (3-Sizes/Body Metrics)",
      fashion: "4. 의상 물리 특성 및 소재 (Fashion Physics/Material)",
      pose: "5. 골격 매핑 및 중심축 (Skeleton/Balance)",
      skin: "6. 피부 탄력 및 처짐 분석 (Elasticity/Ptosis/SSS)",
      light: "7. 광학 측정 및 조도 데이터 (Photometric/Luminance)",
      camera: "8. 카메라 광학 지표 (Camera Optics/EV)",
      bg: "9. 공간 기하학 (Environment Geometry)",
      fx: "10. 디지털 후처리 데이터 (Digital LUT/FX)",
      inter: "11. 인물 상호작용 및 물리 역학 (Interaction Physics)"
    } : {
      face: "1. FACE GEOMETRY & SUBDERMAL",
      expr: "2. EXPRESSION PHYSICS",
      body: "3. 3-SIZES & BODY METRICS",
      fashion: "4. FASHION PHYSICS & MATERIAL",
      pose: "5. SKELETON MAPPING",
      skin: "6. ELASTICITY & PTOSIS ANALYSIS",
      light: "7. PHOTOMETRIC & LUMINANCE DATA",
      camera: "8. CAMERA OPTICS/EV",
      bg: "9. ENVIRONMENT GEOMETRY",
      fx: "10. DIGITAL LUT/FX DATA",
      inter: "11. INTERACTION PHYSICS & DYNAMICS"
    };

    return `[${titles.face}]
${lang === 'ko' ? r.face_ko : r.face}

[${titles.expr}]
${lang === 'ko' ? r.expression_ko : r.expression}

[${titles.body}]
${lang === 'ko' ? r.body_ko : r.body}

[${titles.pose}]
${lang === 'ko' ? r.pose_ko : r.pose}

[${titles.inter}]
${lang === 'ko' ? r.interaction_ko : r.interaction}

[${titles.fashion}]
${lang === 'ko' ? r.fashion_ko : r.fashion}

[${titles.skin}]
${lang === 'ko' ? r.skin_ko : r.skin}

[${titles.light}]
${lang === 'ko' ? r.lighting_ko : r.lighting}

[${titles.camera}]
${lang === 'ko' ? r.camera_ko : r.camera}

[${titles.bg}]
${lang === 'ko' ? r.background_ko : r.background}

[${titles.fx}]
${lang === 'ko' ? r.effects_ko : r.effects}`;
  };

  const switchAnalysisLang = (lang: 'en' | 'ko') => {
    if (!slot.rawAnalysis) return;
    const formatted = formatAnalysis(slot.rawAnalysis, lang);
    onUpdate(slot.id, { 
      analysisLang: lang,
      analysisText: formatted 
    });
  };

  const handleFile = async (file: File) => {
    onUpdate(slot.id, { status: 'analyzing', error: null, originalImage: null, generatedImage: null });
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(',')[1];
      onUpdate(slot.id, { originalImage: base64 });
      
      try {
        const result = await analyzeImage(base64, file.type);
        const formatted = formatAnalysis(result, 'en');
        onUpdate(slot.id, { 
          rawAnalysis: result,
          analysisText: formatted,
          analysisLang: 'en',
          currentPrompt: result.prompt_en,
          promptLang: 'en',
          status: 'idle'
        });
      } catch (e: any) {
        onUpdate(slot.id, { status: 'error', error: e.message || "Analysis Failed" });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleReanalyze = async () => {
    if (!slot.originalImage || slot.status === 'analyzing') return;
    
    onUpdate(slot.id, { status: 'analyzing', error: null });
    
    try {
      // Since we store only the base64, we default to image/png for re-analysis
      const result = await analyzeImage(slot.originalImage, 'image/png');
      const formatted = formatAnalysis(result, slot.analysisLang);
      onUpdate(slot.id, { 
        rawAnalysis: result,
        analysisText: formatted,
        currentPrompt: slot.promptLang === 'en' ? result.prompt_en : result.prompt_ko,
        status: 'idle'
      });
    } catch (e: any) {
      onUpdate(slot.id, { status: 'error', error: e.message || "Re-analysis Failed" });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) handleFile(file);
        break;
      }
    }
  };

  const handleGenerate = async () => {
    if (!slot.currentPrompt) return;
    onUpdate(slot.id, { status: 'generating', error: null });

    try {
      const newImage = await generateImageFromPrompt(slot.currentPrompt, settings);
      onUpdate(slot.id, { generatedImage: newImage, status: 'idle' });
      const completeSlot = { ...slot, generatedImage: newImage };
      onSaveToHistory(completeSlot);
    } catch (e: any) {
      onUpdate(slot.id, { status: 'error', error: e.message || "Generation Failed" });
    }
  };

  const switchPromptLang = (lang: 'en' | 'ko') => {
    if (!slot.rawAnalysis) return;
    onUpdate(slot.id, { 
      promptLang: lang,
      currentPrompt: lang === 'en' ? slot.rawAnalysis.prompt_en : slot.rawAnalysis.prompt_ko
    });
  };

  const downloadImage = (base64: string) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64}`;
    link.download = `nano-gen-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm flex flex-col md:flex-row h-[720px] mb-8 select-text">
      
      {/* LEFT: Input & Analysis */}
      <div 
        className={`relative w-full md:w-1/2 p-4 flex flex-col gap-3 border-b md:border-b-0 md:border-r border-zinc-800 transition-colors ${dragActive ? 'bg-zinc-800/50 ring-2 ring-yellow-500/50' : ''}`}
        onDragEnter={() => setDragActive(true)}
        onDragLeave={() => setDragActive(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
         <div className="flex justify-between items-center text-xs text-zinc-500 font-bold uppercase tracking-wider select-none">
            <div className="flex items-center gap-2">
               <span>Workspace {index + 1}</span>
               <button 
                 onClick={() => onDelete(slot.id)}
                 className="text-zinc-700 hover:text-red-500 transition-colors p-1"
                 title="Delete Workspace"
               >
                 <Trash2 size={12} />
               </button>
            </div>
            <span>Input / Digital Twin Analysis</span>
         </div>

         {/* Image Area */}
         <div className="relative h-48 bg-black/20 rounded-lg border-2 border-dashed border-zinc-700 hover:border-zinc-500 transition-colors flex items-center justify-center overflow-hidden group flex-shrink-0">
            {slot.originalImage ? (
               <>
                 <img 
                   src={`data:image/png;base64,${slot.originalImage}`} 
                   className="max-h-full max-w-full object-contain pointer-events-auto" 
                   alt="Input"
                 />
                 <button 
                   onClick={() => onUpdate(slot.id, { originalImage: null, rawAnalysis: null, analysisText: '', currentPrompt: '' })}
                   className="absolute top-2 right-2 bg-black/60 hover:bg-red-500/80 text-white p-1.5 rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all z-10"
                 >
                   <X size={14} />
                 </button>
               </>
            ) : (
               <div 
                 onClick={() => fileInputRef.current?.click()}
                 className="text-center cursor-pointer p-4 w-full h-full flex flex-col items-center justify-center"
               >
                  <Upload size={24} className="text-zinc-600 mb-2" />
                  <p className="text-zinc-400 text-sm font-medium">Click, Paste or Drop Image</p>
               </div>
            )}
            <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} hidden accept="image/*"/>
         </div>

         {/* Editable Analysis */}
         <div className="flex-1 flex flex-col min-h-0 relative">
            <div className="flex justify-between items-center mb-1 select-none">
               <div className="flex items-center gap-2">
                 <span className="text-xs text-zinc-400 font-semibold uppercase">Literal Spec Data</span>
                 <div className="flex gap-1 ml-2">
                   <button 
                     onClick={() => switchAnalysisLang('en')} 
                     disabled={!slot.rawAnalysis}
                     className={`text-[10px] px-2 py-0.5 rounded transition-colors ${slot.analysisLang === 'en' ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                   >
                     EN
                   </button>
                   <button 
                     onClick={() => switchAnalysisLang('ko')} 
                     disabled={!slot.rawAnalysis}
                     className={`text-[10px] px-2 py-0.5 rounded transition-colors ${slot.analysisLang === 'ko' ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                   >
                     KO
                   </button>
                   {slot.originalImage && (
                    <button 
                      onClick={handleReanalyze}
                      disabled={slot.status === 'analyzing'}
                      className="ml-1 text-zinc-600 hover:text-yellow-500 transition-colors p-0.5"
                      title="Re-analyze image"
                    >
                      <RefreshCw size={12} className={slot.status === 'analyzing' ? 'animate-spin' : ''} />
                    </button>
                   )}
                 </div>
               </div>
               {slot.status === 'analyzing' && <span className="text-xs text-yellow-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Scanning...</span>}
            </div>
            <textarea 
               value={slot.analysisText}
               onChange={(e) => onUpdate(slot.id, { analysisText: e.target.value })}
               placeholder="Detailed technical data will appear here..."
               className="flex-1 w-full bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-[11px] text-zinc-300 font-mono leading-relaxed resize-none focus:outline-none focus:border-yellow-500/50 custom-scrollbar pointer-events-auto"
            />
            {slot.analysisText && (
               <button onClick={() => navigator.clipboard.writeText(slot.analysisText)} className="absolute bottom-2 right-2 text-zinc-600 hover:text-zinc-300 bg-zinc-900/80 p-1 rounded z-10">
                 <Copy size={12} />
               </button>
            )}
         </div>
      </div>

      {/* RIGHT: Prompt & Generation */}
      <div className="w-full md:w-1/2 p-4 flex flex-col gap-3 bg-zinc-900/50">
         <div className="flex justify-between items-center text-xs text-zinc-500 font-bold uppercase tracking-wider select-none">
            <span>Generation Output</span>
            {slot.status === 'generating' && <span className="text-purple-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Synthesizing...</span>}
         </div>

         {/* Generated Image Area */}
         <div className="relative h-48 bg-black/40 rounded-lg border border-zinc-800 flex items-center justify-center overflow-hidden group flex-shrink-0">
            {slot.generatedImage ? (
               <>
                 <img 
                   src={`data:image/png;base64,${slot.generatedImage}`} 
                   className="max-h-full max-w-full object-contain pointer-events-auto" 
                   alt="Output"
                 />
                 <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button onClick={() => onOpenModal({ base64: slot.generatedImage!, prompt: slot.currentPrompt })} className="bg-black/60 hover:bg-black p-1.5 rounded-md text-white backdrop-blur"><Maximize2 size={14}/></button>
                    <button onClick={() => downloadImage(slot.generatedImage!)} className="bg-black/60 hover:bg-black p-1.5 rounded-md text-white backdrop-blur"><Download size={14}/></button>
                    <button onClick={() => onUpdate(slot.id, { generatedImage: null })} className="bg-black/60 hover:bg-red-500 p-1.5 rounded-md text-white backdrop-blur"><Trash2 size={14}/></button>
                 </div>
               </>
            ) : (
               <div className="text-zinc-700 flex flex-col items-center select-none">
                  < Wand2 size={24} className="mb-2 opacity-50"/>
                  <span className="text-xs">Generated Visual Data</span>
               </div>
            )}
         </div>

         {/* Prompt Editor */}
         <div className="flex-1 flex flex-col min-h-0 relative">
             <div className="flex justify-between items-center mb-1 select-none">
               <div className="flex gap-1">
                 <button onClick={() => switchPromptLang('en')} className={`text-[10px] px-2 py-0.5 rounded ${slot.promptLang === 'en' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>EN</button>
                 <button onClick={() => switchPromptLang('ko')} className={`text-[10px] px-2 py-0.5 rounded ${slot.promptLang === 'ko' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>KO</button>
               </div>
               <button onClick={() => navigator.clipboard.writeText(slot.currentPrompt)} className="text-zinc-500 hover:text-white"><Copy size={12}/></button>
             </div>
             <textarea 
               value={slot.currentPrompt}
               onChange={(e) => onUpdate(slot.id, { currentPrompt: e.target.value })}
               className="flex-1 w-full bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-sm text-zinc-300 leading-relaxed resize-none focus:outline-none focus:border-purple-500/50 custom-scrollbar pointer-events-auto"
               placeholder="High-precision generation tags..."
             />
         </div>

         {/* Generate Button */}
         <button 
           onClick={handleGenerate}
           disabled={!slot.currentPrompt || slot.status === 'generating'}
           className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none"
         >
            {slot.status === 'generating' ? 'Synthesizing...' : 'Reconstruct Image'}
         </button>

         {/* Error Toast */}
         {slot.error && (
            <div className="text-xs text-red-400 bg-red-900/10 p-2 rounded border border-red-900/30">
               Error: {slot.error}
            </div>
         )}
      </div>
    </div>
  );
};
