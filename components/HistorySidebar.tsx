import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Archive, Database, Download, HardDrive, LoaderCircle, Search, Trash2, X } from 'lucide-react';
import { exportAllHistory, getStorageStatus, getThumbnailBlob, requestPersistentStorage } from '../services/storageService';
import type { HistoryMetadata, StorageStatus } from '../types';
import { formatUsd } from '../utils/analysisReport';

interface Props {
  items: HistoryMetadata[];
  isOpen: boolean;
  hasMore: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onLoadMore: () => Promise<void>;
  onSearch: (query: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClear: () => Promise<void>;
}

function formatBytes(value: number): string {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}

function HistoryRow({ item, onSelect, onDelete }: {
  item: HistoryMetadata;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let active = true;
    void getThumbnailBlob(item.id).then((blob) => {
      if (!blob || !active) return;
      url = URL.createObjectURL(blob);
      setThumbnail(url);
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.id]);

  return (
    <div className="history-row" onClick={() => onSelect(item.id)}>
      <div className="history-thumb">{thumbnail ? <img src={thumbnail} alt="" /> : <Archive size={17} />}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`history-mode ${item.pipeline}`}>{item.pipeline === 'harness' ? 'HARNESS' : 'ORIGINAL'}</span>
          <time>{new Date(item.timestamp).toLocaleString()}</time>
        </div>
        <strong>{item.title}</strong>
        <p>{item.promptUsed}</p>
        {item.report && (
          <div className="history-report">
            <span>{item.report.requestedModel}</span>
            <span>AV {item.report.agenticVisionStatus}</span>
            <span>{formatUsd(item.report.cost.totalUsd)}</span>
          </div>
        )}
      </div>
      <button className="history-delete" onClick={(event) => { event.stopPropagation(); void onDelete(item.id); }} aria-label="기록 삭제"><Trash2 size={13} /></button>
    </div>
  );
}

export function HistorySidebar({ items, isOpen, hasMore, onClose, onSelect, onLoadMore, onSearch, onDelete, onClear }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [storage, setStorage] = useState<StorageStatus>({ supported: true, persisted: false, usage: 0, quota: 0 });
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 108,
    overscan: 8,
  });

  useEffect(() => { void getStorageStatus().then(setStorage); }, [items.length]);
  const percent = storage.quota ? Math.min(100, (storage.usage / storage.quota) * 100) : 0;

  return (
    <>
      {isOpen && <button className="sidebar-backdrop lg:hidden" onClick={onClose} aria-label="히스토리 닫기" />}
      <aside className={`history-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="history-header">
          <div><p className="eyebrow">LOCAL ARCHIVE</p><h2><Database size={17} /> History</h2></div>
          <button className="icon-button lg:hidden" onClick={onClose}><X size={17} /></button>
        </div>

        <form className="history-search" onSubmit={(event) => { event.preventDefault(); void onSearch(query); }}>
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="프롬프트·분석 검색" />
          {query && <button type="button" onClick={() => { setQuery(''); void onSearch(''); }}><X size={13} /></button>}
        </form>

        <div ref={parentRef} className="history-list">
          {items.length === 0 ? (
            <div className="empty-history"><Archive size={24} /><span>저장된 분석이 없습니다</span></div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const item = items[virtualItem.index];
                return (
                  <div
                    key={item.id}
                    ref={virtualizer.measureElement}
                    data-index={virtualItem.index}
                    style={{ position: 'absolute', insetInline: 0, transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <HistoryRow item={item} onSelect={onSelect} onDelete={onDelete} />
                  </div>
                );
              })}
            </div>
          )}
          {hasMore && (
            <button className="load-more" disabled={loadingMore} onClick={async () => {
              setLoadingMore(true);
              await onLoadMore();
              setLoadingMore(false);
            }}>{loadingMore ? <LoaderCircle className="animate-spin" size={14} /> : null} 더 불러오기</button>
          )}
        </div>

        <div className="history-footer">
          <div className="storage-card">
            <div><span><HardDrive size={13} /> 브라우저 저장소</span><b>{formatBytes(storage.usage)} / {formatBytes(storage.quota)}</b></div>
            <div className="storage-bar"><i style={{ width: `${percent}%` }} /></div>
            <button disabled={storage.persisted || !storage.supported} onClick={() => void requestPersistentStorage().then(setStorage)}>
              {storage.persisted ? '지속 저장 허용됨' : '지속 저장 요청'}
            </button>
          </div>
          <button className="secondary-button w-full" disabled={exporting || !items.length} onClick={async () => {
            setExporting(true);
            try {
              await exportAllHistory((done, total) => setExportProgress(`${done} / ${total}`));
            } catch (error) {
              if (!(error instanceof DOMException && error.name === 'AbortError')) alert(error instanceof Error ? error.message : '내보내기에 실패했습니다.');
            } finally {
              setExporting(false);
              setExportProgress('');
            }
          }}>
            {exporting ? <LoaderCircle className="animate-spin" size={14} /> : <Download size={14} />}
            {exporting ? `내보내는 중 ${exportProgress}` : '전체 원본 + 분석 ZIP 내보내기'}
          </button>
          <button className="danger-text-button" disabled={!items.length} onClick={async () => {
            if (!confirm('새 저장소의 히스토리와 이미지 파일을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
            await onClear();
          }}><Trash2 size={13} /> 전체 삭제</button>
        </div>
      </aside>
    </>
  );
}
