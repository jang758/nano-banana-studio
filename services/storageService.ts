import { openDB, type IDBPDatabase } from 'idb';
import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { DEFAULT_SETTINGS } from '../constants';
import { formatAnalysisReport } from '../utils/analysisReport';
import type {
  AppSettings,
  HistoryMetadata,
  HistoryPage,
  HistoryRecord,
  HistorySaveInput,
  LoadedHistoryItem,
  StorageStatus,
} from '../types';

const DB_NAME = 'NanoBananaStudioDB';
const DB_VERSION = 3;
const SESSION_STORE = 'sessions';
const THUMBNAIL_STORE = 'thumbnails';
const LEGACY_STORE = 'history';
const META_STORE = 'meta';
const OPFS_APP_DIR = 'nano-banana-studio';
const OPFS_ASSET_DIR = 'assets';

let databasePromise: Promise<IDBPDatabase> | null = null;

function getDatabase(): Promise<IDBPDatabase> {
  if (!databasePromise) {
    databasePromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          const sessions = db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
          sessions.createIndex('timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains(THUMBNAIL_STORE)) {
          db.createObjectStore(THUMBNAIL_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
        // v1 history는 마이그레이션 검증 전까지 보존한다.
      },
    });
  }
  return databasePromise;
}

function requireOpfs(): void {
  if (!navigator.storage?.getDirectory) {
    throw new Error('이 브라우저는 대용량 이미지 저장소(OPFS)를 지원하지 않습니다. 최신 Chrome 또는 Edge를 사용해 주세요.');
  }
}

async function getAssetsDirectory(create = true): Promise<FileSystemDirectoryHandle> {
  requireOpfs();
  const root = await navigator.storage.getDirectory();
  const app = await root.getDirectoryHandle(OPFS_APP_DIR, { create });
  return app.getDirectoryHandle(OPFS_ASSET_DIR, { create });
}

async function getItemDirectory(id: string, create = true): Promise<FileSystemDirectoryHandle> {
  const assets = await getAssetsDirectory(create);
  return assets.getDirectoryHandle(id, { create });
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function writeBlob(directory: FileSystemDirectoryHandle, name: string, blob: Blob): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function readBlob(id: string, name?: string): Promise<Blob | undefined> {
  if (!name) return undefined;
  const directory = await getItemDirectory(id, false);
  const file = await directory.getFileHandle(name);
  return file.getFile();
}

async function createThumbnail(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const maxEdge = 320;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('썸네일 캔버스를 만들 수 없습니다.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (thumbnail) => thumbnail ? resolve(thumbnail) : reject(new Error('썸네일 생성에 실패했습니다.')),
      'image/webp',
      0.78,
    );
  });
}

function metadataFromRecord(record: HistoryRecord): HistoryMetadata {
  const {
    id,
    timestamp,
    title,
    promptUsed,
    pipeline,
    type,
    originalMimeType,
    generatedMimeType,
    thumbnailId,
    searchText,
    report,
  } = record;
  return { id, timestamp, title, promptUsed, pipeline, type, originalMimeType, generatedMimeType, thumbnailId, searchText, report };
}

function createId(): string {
  return `item_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export async function saveHistoryItem(input: HistorySaveInput): Promise<HistoryMetadata> {
  const db = await getDatabase();
  const id = input.id || createId();
  const timestamp = input.timestamp || Date.now();
  const existed = Boolean(await db.get(SESSION_STORE, id));
  const existing = existed ? await db.get(SESSION_STORE, id) as HistoryRecord : undefined;
  const itemDirectory = await getItemDirectory(id, true);

  let originalFile = existing?.originalFile;
  let generatedFile = existing?.generatedFile;
  let thumbnailBlob: Blob | undefined;

  try {
    if (input.originalImage && input.originalMimeType) {
      const originalBlob = base64ToBlob(input.originalImage, input.originalMimeType);
      originalFile = `original.${extensionForMime(input.originalMimeType)}`;
      await writeBlob(itemDirectory, originalFile, originalBlob);
      thumbnailBlob = await createThumbnail(originalBlob);
    }
    if (input.generatedImage && input.generatedMimeType) {
      const generatedBlob = base64ToBlob(input.generatedImage, input.generatedMimeType);
      generatedFile = `generated.${extensionForMime(input.generatedMimeType)}`;
      await writeBlob(itemDirectory, generatedFile, generatedBlob);
      thumbnailBlob = await createThumbnail(generatedBlob);
    }

    const title = input.title?.trim() || input.promptUsed.trim().slice(0, 72) || 'Untitled analysis';
    const record: HistoryRecord = {
      id,
      timestamp,
      title,
      promptUsed: input.promptUsed,
      pipeline: input.pipeline,
      type: input.type,
      originalMimeType: input.originalMimeType || existing?.originalMimeType,
      generatedMimeType: input.generatedMimeType || existing?.generatedMimeType,
      thumbnailId: thumbnailBlob ? id : existing?.thumbnailId,
      searchText: `${title}\n${input.promptUsed}\n${input.analysisText}\n${input.report ? formatAnalysisReport(input.report) : ''}`.toLocaleLowerCase(),
      analysis: input.analysis || undefined,
      analysisText: input.analysisText,
      analysisLang: input.analysisLang,
      promptLang: input.promptLang,
      trace: input.trace || undefined,
      report: input.report || undefined,
      settings: input.settings,
      originalFile,
      generatedFile,
    };

    const tx = db.transaction([SESSION_STORE, THUMBNAIL_STORE], 'readwrite');
    await tx.objectStore(SESSION_STORE).put(record);
    if (thumbnailBlob) await tx.objectStore(THUMBNAIL_STORE).put({ id, blob: thumbnailBlob });
    await tx.done;
    return metadataFromRecord(record);
  } catch (error) {
    if (!existed) {
      const assets = await getAssetsDirectory(true);
      await assets.removeEntry(id, { recursive: true }).catch(() => undefined);
    }
    throw error;
  }
}

export async function getHistoryPage(limit = 60, before?: number): Promise<HistoryPage> {
  const db = await getDatabase();
  const tx = db.transaction(SESSION_STORE, 'readonly');
  const index = tx.store.index('timestamp');
  const range = before === undefined ? undefined : IDBKeyRange.upperBound(before, true);
  let cursor = await index.openCursor(range, 'prev');
  const items: HistoryMetadata[] = [];
  while (cursor && items.length < limit) {
    items.push(metadataFromRecord(cursor.value as HistoryRecord));
    cursor = await cursor.continue();
  }
  await tx.done;
  return {
    items,
    nextBefore: cursor && items.length ? items[items.length - 1].timestamp : undefined,
  };
}

export async function searchHistory(query: string): Promise<HistoryMetadata[]> {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return (await getHistoryPage()).items;
  const db = await getDatabase();
  const tx = db.transaction(SESSION_STORE, 'readonly');
  let cursor = await tx.store.index('timestamp').openCursor(undefined, 'prev');
  const results: HistoryMetadata[] = [];
  while (cursor) {
    const record = cursor.value as HistoryRecord;
    if (record.searchText.includes(normalized)) results.push(metadataFromRecord(record));
    cursor = await cursor.continue();
  }
  await tx.done;
  return results;
}

export async function getThumbnailBlob(id: string): Promise<Blob | null> {
  const db = await getDatabase();
  const value = await db.get(THUMBNAIL_STORE, id) as { id: string; blob: Blob } | undefined;
  return value?.blob ?? null;
}

export async function getFullHistoryItem(id: string): Promise<LoadedHistoryItem | null> {
  const db = await getDatabase();
  const record = await db.get(SESSION_STORE, id) as HistoryRecord | undefined;
  if (!record) return null;
  const [original, generated] = await Promise.all([
    readBlob(id, record.originalFile).catch(() => undefined),
    readBlob(id, record.generatedFile).catch(() => undefined),
  ]);
  return {
    ...record,
    originalImageBase64: original ? await blobToBase64(original) : undefined,
    generatedImageBase64: generated ? await blobToBase64(generated) : undefined,
  };
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction([SESSION_STORE, THUMBNAIL_STORE], 'readwrite');
  await Promise.all([
    tx.objectStore(SESSION_STORE).delete(id),
    tx.objectStore(THUMBNAIL_STORE).delete(id),
  ]);
  await tx.done;
  const assets = await getAssetsDirectory(true);
  await assets.removeEntry(id, { recursive: true }).catch((error: DOMException) => {
    if (error.name !== 'NotFoundError') throw error;
  });
}

export async function clearAllHistory(): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction([SESSION_STORE, THUMBNAIL_STORE], 'readwrite');
  await Promise.all([
    tx.objectStore(SESSION_STORE).clear(),
    tx.objectStore(THUMBNAIL_STORE).clear(),
  ]);
  await tx.done;
  const root = await navigator.storage.getDirectory();
  const app = await root.getDirectoryHandle(OPFS_APP_DIR, { create: true });
  await app.removeEntry(OPFS_ASSET_DIR, { recursive: true }).catch((error: DOMException) => {
    if (error.name !== 'NotFoundError') throw error;
  });
  await app.getDirectoryHandle(OPFS_ASSET_DIR, { create: true });
}

export async function requestPersistentStorage(): Promise<StorageStatus> {
  const supported = 'storage' in navigator;
  if (!supported) return { supported: false, persisted: false, usage: 0, quota: 0 };
  const persisted = await navigator.storage.persist();
  const estimate = await navigator.storage.estimate();
  return {
    supported: true,
    persisted,
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
  };
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const supported = 'storage' in navigator;
  if (!supported) return { supported: false, persisted: false, usage: 0, quota: 0 };
  const [persisted, estimate] = await Promise.all([
    navigator.storage.persisted(),
    navigator.storage.estimate(),
  ]);
  return {
    supported: true,
    persisted,
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
  };
}

async function getAllRecordIds(): Promise<string[]> {
  const db = await getDatabase();
  const tx = db.transaction(SESSION_STORE, 'readonly');
  let cursor = await tx.store.index('timestamp').openCursor(undefined, 'prev');
  const ids: string[] = [];
  while (cursor) {
    ids.push((cursor.value as HistoryRecord).id);
    cursor = await cursor.continue();
  }
  await tx.done;
  return ids;
}

function safeFolderName(record: HistoryRecord): string {
  const date = new Date(record.timestamp).toISOString().replace(/[:.]/g, '-');
  return `${date}_${record.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

async function addRecordToZip(zip: ZipWriter<unknown>, record: HistoryRecord): Promise<void> {
  const folder = safeFolderName(record);
  const portable = { ...record };
  await zip.add(`${folder}/record.json`, new TextReader(JSON.stringify(portable, null, 2)));
  await zip.add(`${folder}/prompt_en-or-current.txt`, new TextReader(record.promptUsed));
  await zip.add(`${folder}/analysis.txt`, new TextReader(record.analysisText));
  if (record.analysis) {
    await zip.add(`${folder}/analysis.json`, new TextReader(JSON.stringify(record.analysis, null, 2)));
  }
  if (record.report) {
    await zip.add(`${folder}/report.md`, new TextReader(formatAnalysisReport(record.report)));
    await zip.add(`${folder}/report.json`, new TextReader(JSON.stringify(record.report, null, 2)));
  }
  const original = await readBlob(record.id, record.originalFile).catch(() => undefined);
  const generated = await readBlob(record.id, record.generatedFile).catch(() => undefined);
  if (original && record.originalFile) await zip.add(`${folder}/${record.originalFile}`, new BlobReader(original));
  if (generated && record.generatedFile) await zip.add(`${folder}/${record.generatedFile}`, new BlobReader(generated));
}

export async function exportAllHistory(onProgress?: (completed: number, total: number) => void): Promise<void> {
  const recordIds = await getAllRecordIds();
  if (!recordIds.length) throw new Error('내보낼 히스토리가 없습니다.');
  const db = await getDatabase();
  const fileName = `nano-banana-history-${new Date().toISOString().slice(0, 10)}.zip`;
  const picker = (window as typeof window & {
    showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle>;
  }).showSaveFilePicker;

  if (picker) {
    const handle = await picker({
      suggestedName: fileName,
      types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
    });
    const writable = await handle.createWritable();
    const zip = new ZipWriter(writable);
    for (let i = 0; i < recordIds.length; i += 1) {
      const record = await db.get(SESSION_STORE, recordIds[i]) as HistoryRecord | undefined;
      if (!record) throw new Error('내보내기 중 히스토리가 변경되어 중단했습니다. 다시 시도해 주세요.');
      await addRecordToZip(zip, record);
      onProgress?.(i + 1, recordIds.length);
    }
    await zip.close();
    return;
  }

  const writer = new BlobWriter('application/zip');
  const zip = new ZipWriter(writer);
  for (let i = 0; i < recordIds.length; i += 1) {
    const record = await db.get(SESSION_STORE, recordIds[i]) as HistoryRecord | undefined;
    if (!record) throw new Error('내보내기 중 히스토리가 변경되어 중단했습니다. 다시 시도해 주세요.');
    await addRecordToZip(zip, record);
    onProgress?.(i + 1, recordIds.length);
  }
  const blob = await zip.close();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface LegacyHistoryItem {
  id: string;
  timestamp: number;
  originalImageBase64?: string;
  generatedImageBase64?: string;
  promptUsed?: string;
  analysis?: HistorySaveInput['analysis'];
  settings?: Partial<AppSettings> & { model?: string; temperature?: number };
  type?: 'generation' | 'edit';
}

export async function migrateLegacyHistory(): Promise<number> {
  const db = await getDatabase();
  if (!db.objectStoreNames.contains(LEGACY_STORE)) return 0;
  if (await db.get(META_STORE, 'legacyMigrationComplete')) return 0;
  const keys = await db.getAllKeys(LEGACY_STORE);
  let migrated = 0;
  for (const key of keys) {
    const id = String(key);
    if (await db.get(SESSION_STORE, id)) continue;
    const legacy = await db.get(LEGACY_STORE, key) as LegacyHistoryItem | undefined;
    if (!legacy) continue;
    const generationModel = legacy.settings?.model === 'gemini-3-pro-image-preview'
      ? 'gemini-3-pro-image'
      : legacy.settings?.model || DEFAULT_SETTINGS.generationModel;
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      generationModel,
      aspectRatio: legacy.settings?.aspectRatio || DEFAULT_SETTINGS.aspectRatio,
      imageSize: legacy.settings?.imageSize || DEFAULT_SETTINGS.imageSize,
    };
    await saveHistoryItem({
      id: legacy.id,
      timestamp: legacy.timestamp,
      originalImage: legacy.originalImageBase64,
      originalMimeType: legacy.originalImageBase64 ? 'image/png' : null,
      generatedImage: legacy.generatedImageBase64,
      generatedMimeType: legacy.generatedImageBase64 ? 'image/png' : null,
      promptUsed: legacy.promptUsed || '',
      analysis: legacy.analysis || null,
      analysisText: '',
      analysisLang: 'en',
      promptLang: 'en',
      settings,
      pipeline: 'standard',
      type: legacy.type || 'generation',
    });
    migrated += 1;
  }
  await db.put(META_STORE, { key: 'legacyMigrationComplete', completedAt: Date.now(), migrated });
  return migrated;
}
