import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

export interface ResultReferencePayload {
  base64: string;
  mimeType: string;
  fileName?: string | null;
}

export interface AnalysisResultSavePayload {
  pipeline: 'standard' | 'harness';
  text: string;
  references: ResultReferencePayload[];
}

export interface SavedAnalysisFiles {
  baseName: string;
  textPath: string;
  referencePaths: string[];
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/tiff': '.tiff',
  'image/webp': '.webp',
};

function timestamp(date: Date): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    '_',
    pad(date.getMilliseconds(), 3),
  ].join('');
}

function referenceExtension(reference: ResultReferencePayload): string {
  const original = reference.fileName ? extname(reference.fileName) : '';
  if (/^\.[a-zA-Z0-9]{1,10}$/.test(original)) return original;
  return MIME_EXTENSIONS[reference.mimeType.toLowerCase()] || '.bin';
}

export async function saveAnalysisResultToDisk(
  projectRoot: string,
  payload: AnalysisResultSavePayload,
  date = new Date(),
  uniqueId = randomUUID().slice(0, 8),
): Promise<SavedAnalysisFiles> {
  if (payload.pipeline !== 'standard' && payload.pipeline !== 'harness') {
    throw new Error('지원하지 않는 분석 방식입니다.');
  }
  if (!payload.text.trim()) throw new Error('저장할 분석 결과가 없습니다.');

  const outputDirectory = join(projectRoot, 'analysis_results');
  await mkdir(outputDirectory, { recursive: true });
  const baseName = `${timestamp(date)}_${payload.pipeline}_${uniqueId}`;
  const createdPaths: string[] = [];

  try {
    const referencePaths: string[] = [];
    for (let index = 0; index < payload.references.length; index += 1) {
      const reference = payload.references[index];
      const bytes = Buffer.from(reference.base64, 'base64');
      if (!bytes.length) throw new Error('참조 이미지 데이터가 비어 있습니다.');
      const suffix = payload.references.length === 1 ? '_ref' : `_ref${index + 1}`;
      const absolutePath = join(outputDirectory, `${baseName}${suffix}${referenceExtension(reference)}`);
      await writeFile(absolutePath, bytes, { flag: 'wx' });
      createdPaths.push(absolutePath);
      referencePaths.push(relative(projectRoot, absolutePath).replaceAll('\\', '/'));
    }

    const textAbsolutePath = join(outputDirectory, `${baseName}.txt`);
    await writeFile(textAbsolutePath, payload.text, { encoding: 'utf8', flag: 'wx' });
    createdPaths.push(textAbsolutePath);
    return {
      baseName,
      textPath: relative(projectRoot, textAbsolutePath).replaceAll('\\', '/'),
      referencePaths,
    };
  } catch (error) {
    await Promise.all(createdPaths.map((path) => unlink(path).catch(() => undefined)));
    throw error;
  }
}
