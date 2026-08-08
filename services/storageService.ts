import { HistoryItem } from "../types";

const DB_NAME = "NanoBananaStudioDB";
const STORE_NAME = "history";
const DB_VERSION = 1;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      console.error("IndexedDB Open Error:", request.error);
      reject(request.error);
    };
  });
};

export const saveHistoryItem = async (item: HistoryItem): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = (event) => {
        const error = (event.target as any).error;
        if (error?.name === 'QuotaExceededError') {
          alert("저장 공간이 가득 찼습니다! 오래된 히스토리를 삭제하세요.");
        }
        reject(error);
      };

      store.put(item);
    });
  } catch (e) {
    throw e;
  }
};

// 최적화: 이미지 데이터를 제외한 목록만 가져오기 (메모리 절약)
export const getHistoryMetadata = async (): Promise<Partial<HistoryItem>[]> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result as HistoryItem[];
        // 메인 스레드 부하를 줄이기 위해 필요한 필드만 매핑
        const metadata = results.map(({ id, timestamp, promptUsed, type }) => ({
          id, timestamp, promptUsed, type
        }));
        metadata.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        resolve(metadata);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    return [];
  }
};

export const getFullHistoryItem = async (id: string): Promise<HistoryItem | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

export const deleteHistoryItem = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const clearAllHistory = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
