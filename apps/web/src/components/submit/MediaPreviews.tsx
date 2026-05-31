import { useEffect, useMemo, useState } from 'react';
import type { SubmissionMediaType } from '../../lib/media';
import { MediaPreviewOverlay } from './MediaPreviewOverlay';

type Props = {
  files: File[];
  type: SubmissionMediaType;
  onRemove: (index: number) => void;
};

export function MediaPreviews({ files, type, onRemove }: Props) {
  const [preview, setPreview] = useState<{ url: string; type: 'image' | 'video' | 'audio'; caption?: string } | null>(null);

  const urls = useMemo(() => {
    const map = new Map<File, string>();
    files.forEach((f) => map.set(f, URL.createObjectURL(f)));
    return map;
  }, [files]);

  useEffect(() => {
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [urls]);

  if (!files.length) return null;

  return (
    <>
      <div id="mediaPreviewContainer" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {files.map((file, index) => {
          const url = urls.get(file)!;
          return (
            <div key={`${file.name}-${index}`} className="media-preview-item">
              <button
                type="button"
                className="media-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(index);
                }}
              >
                &times;
              </button>
              {type === 'image' && (
                <img
                  src={url}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onClick={() => setPreview({ url, type: 'image', caption: `Halaman ${index + 1}` })}
                />
              )}
              {type === 'video' && (
                <>
                  <video src={url} muted preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div className="play-overlay" />
                  <div
                    style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}
                    onClick={() => setPreview({ url, type: 'video', caption: `Video ${index + 1}` })}
                  />
                </>
              )}
              {type === 'audio' && (
                <div
                  className="media-icon"
                  style={{ cursor: 'pointer', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setPreview({ url, type: 'audio', caption: `Audio ${index + 1}` })}
                >
                  🎵
                </div>
              )}
              <div className="media-label">{index + 1}</div>
            </div>
          );
        })}
      </div>
      {preview && (
        <MediaPreviewOverlay
          open
          type={preview.type}
          url={preview.url}
          caption={preview.caption}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
