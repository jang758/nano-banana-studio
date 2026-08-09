import { describe, expect, it } from 'vitest';
import { getClipboardImage, takeSelectedFile } from '../utils/imageInput';

const file = (type: string) => ({ type }) as File;

describe('getClipboardImage', () => {
  it('uses an image clipboard item when available', () => {
    const image = file('image/png');
    const result = getClipboardImage({
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => image }] as unknown as DataTransferItemList,
      files: [] as unknown as FileList,
    });
    expect(result).toBe(image);
  });

  it('falls back to clipboard files and ignores non-images', () => {
    const image = file('image/webp');
    const result = getClipboardImage({
      items: [] as unknown as DataTransferItemList,
      files: [file('text/plain'), image] as unknown as FileList,
    });
    expect(result).toBe(image);
  });

  it('returns null when the clipboard contains no image', () => {
    const result = getClipboardImage({
      items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] as unknown as DataTransferItemList,
      files: [file('application/pdf')] as unknown as FileList,
    });
    expect(result).toBeNull();
  });
});

describe('takeSelectedFile', () => {
  it('returns the selected file and clears the input so the same file can be selected again', () => {
    const selected = file('image/png');
    const input = { files: [selected] as unknown as FileList, value: 'C:\\fakepath\\sample.png' };
    expect(takeSelectedFile(input)).toBe(selected);
    expect(input.value).toBe('');
  });
});
