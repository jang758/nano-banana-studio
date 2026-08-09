export function getClipboardImage(clipboardData: Pick<DataTransfer, 'items' | 'files'>): File | null {
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }

  return Array.from(clipboardData.files).find((file) => file.type.startsWith('image/')) ?? null;
}
