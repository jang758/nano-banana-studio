import React from 'react';
import { AppSettings, ModelType, AspectRatio, ImageSize } from '../types';
import { Settings, Zap } from 'lucide-react';
import { openApiKeySelection } from '../services/geminiService';

interface SettingsPanelProps {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  setSettings,
  isOpen,
  setIsOpen
}) => {
  const handleChange = (key: keyof AppSettings, value: any) => {
    setSettings({ ...settings, [key]: value });
  };

  const handleModelChange = async (model: ModelType) => {
    if (model === ModelType.NANO_BANANA_PRO) {
       // Trigger key selection flow immediately upon selection if possible, 
       // but actual check happens at generation time. 
       // We can give a visual cue here.
       try {
         await openApiKeySelection();
       } catch (e) {
         console.error("Key selection skipped or failed", e);
       }
    }
    handleChange('model', model);
  };

  return (
    <div className={`fixed lg:static inset-y-0 right-0 z-40 w-80 bg-zinc-900 border-l border-zinc-800 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
       <div className="flex flex-col h-full">
         <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
            <h2 className="text-xl font-bold text-yellow-400 flex items-center gap-2">
              <Settings size={20} />
              Configuration
            </h2>
            <button onClick={() => setIsOpen(false)} className="lg:hidden text-zinc-400">
               <Zap size={20} />
            </button>
         </div>

         <div className="p-6 space-y-6 flex-1 overflow-y-auto">
           
           {/* Model Selection */}
           <div className="space-y-3">
             <label className="text-sm font-medium text-zinc-400">AI Model</label>
             <div className="grid grid-cols-1 gap-2">
               <button
                 onClick={() => handleModelChange(ModelType.NANO_BANANA)}
                 className={`p-3 rounded-lg border text-left transition-all ${settings.model === ModelType.NANO_BANANA ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'}`}
               >
                 <div className="font-bold">Nano Banana</div>
                 <div className="text-xs opacity-70">Gemini 2.5 Flash Image - Fast & Efficient</div>
               </button>
               <button
                 onClick={() => handleModelChange(ModelType.NANO_BANANA_PRO)}
                 className={`p-3 rounded-lg border text-left transition-all ${settings.model === ModelType.NANO_BANANA_PRO ? 'bg-purple-500/10 border-purple-500 text-purple-400' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'}`}
               >
                 <div className="font-bold">Nano Banana Pro</div>
                 <div className="text-xs opacity-70">Gemini 3 Pro Image - High Fidelity (Paid Key)</div>
               </button>
             </div>
             {settings.model === ModelType.NANO_BANANA_PRO && (
               <div className="text-xs text-purple-400 bg-purple-500/10 p-2 rounded">
                 * Requires selecting a paid project API key.
               </div>
             )}
           </div>

           {/* Aspect Ratio */}
           <div className="space-y-3">
             <label className="text-sm font-medium text-zinc-400">Aspect Ratio</label>
             <div className="grid grid-cols-3 gap-2">
               {['1:1', '3:4', '4:3', '9:16', '16:9'].map((ratio) => (
                 <button
                   key={ratio}
                   onClick={() => handleChange('aspectRatio', ratio)}
                   className={`py-2 px-3 text-sm rounded-md transition-all ${settings.aspectRatio === ratio ? 'bg-zinc-100 text-zinc-900 font-bold' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                 >
                   {ratio}
                 </button>
               ))}
             </div>
           </div>

           {/* Image Size (Pro Only) */}
           <div className="space-y-3">
             <div className="flex justify-between">
                <label className="text-sm font-medium text-zinc-400">Image Resolution</label>
                {settings.model !== ModelType.NANO_BANANA_PRO && <span className="text-xs text-zinc-600">Pro Only</span>}
             </div>
             <div className="grid grid-cols-3 gap-2">
               {(['1K', '2K', '4K'] as ImageSize[]).map((size) => (
                 <button
                   key={size}
                   disabled={settings.model !== ModelType.NANO_BANANA_PRO}
                   onClick={() => handleChange('imageSize', size)}
                   className={`py-2 px-3 text-sm rounded-md transition-all ${settings.imageSize === size && settings.model === ModelType.NANO_BANANA_PRO ? 'bg-zinc-100 text-zinc-900 font-bold' : 'bg-zinc-800 text-zinc-400 border border-transparent'} ${settings.model !== ModelType.NANO_BANANA_PRO ? 'opacity-30 cursor-not-allowed' : 'hover:bg-zinc-700'}`}
                 >
                   {size}
                 </button>
               ))}
             </div>
           </div>

           {/* Temperature */}
           <div className="space-y-3">
             <label className="text-sm font-medium text-zinc-400 flex justify-between">
                <span>Creativity (Temperature)</span>
                <span>{settings.temperature}</span>
             </label>
             <input
               type="range"
               min="0"
               max="2"
               step="0.1"
               value={settings.temperature}
               onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
               className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
             />
             <div className="flex justify-between text-xs text-zinc-600">
               <span>Precise</span>
               <span>Creative</span>
             </div>
           </div>

         </div>
       </div>
    </div>
  );
};