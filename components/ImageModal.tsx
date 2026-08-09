import { Copy, Download, X } from 'lucide-react';
import type { ModalData } from '../types';

export function ImageModal({ data, onClose }: { data: ModalData | null; onClose: () => void }) {
  if (!data) return null;
  const source = `data:${data.mimeType};base64,${data.base64}`;

  const copyImage = async () => {
    const response = await fetch(source);
    const sourceBlob = await response.blob();
    let blob = sourceBlob;
    if (sourceBlob.type !== 'image/png') {
      const bitmap = await createImageBitmap(sourceBlob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      bitmap.close();
      blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG 변환 실패')), 'image/png'));
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="image-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <div className="modal-image-wrap"><img src={source} alt="전체 이미지" /></div>
        <div className="modal-side">
          <div className="flex gap-2">
            <button className="secondary-button" onClick={() => void copyImage()}><Copy size={14} /> 이미지 복사</button>
            <a className="secondary-button" href={source} download={`nano-banana-${Date.now()}`}><Download size={14} /> 다운로드</a>
          </div>
          {data.prompt && <textarea readOnly value={data.prompt} />}
        </div>
      </div>
    </div>
  );
}
