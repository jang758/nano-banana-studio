export function getClipboardImage(clipboardData: Pick<DataTransfer, 'items' | 'files'>): File | null {
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }

  return Array.from(clipboardData.files).find((file) => file.type.startsWith('image/')) ?? null;
}

export function takeSelectedFile(input: Pick<HTMLInputElement, 'files' | 'value'>): File | null {
  const file = input.files?.[0] ?? null;
  input.value = '';
  return file;
}

export async function readImageFile(file: File): Promise<{ base64: string; mimeType: string; fileName: string | null }> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 사용할 수 있습니다.');
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
  if (!base64) throw new Error('이미지를 읽지 못했습니다.');
  return { base64, mimeType: file.type, fileName: file.name || null };
}
