import { useCallback, useEffect, useRef, useState } from 'react';
import { formatTime, MAX_CAPTURED_MEDIA } from '../../lib/media';
import { validateMediaFile } from '../../lib/media';
import { FormatErrorModal } from './FormatErrorModal';

type Props = {
  files: File[];
  onAddFile: (file: File) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
};

export function AudioRecorder({ files, onAddFile, showToast }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const secondsRef = useRef(0);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [hint, setHint] = useState('Tekan tombol untuk mulai merekam');
  const [showFallback, setShowFallback] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);

  const drawFlatLine = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f9f6f0';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#e0d8c8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
  }, []);

  const drawWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const buf = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      if (!analyserRef.current) return;
      animRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(buf);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#f9f6f0';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#e0d8c8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#6b8f5e';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const slice = W / buf.length;
      let x = 0;
      for (let i = 0; i < buf.length; i++) {
        const y = (buf[i] / 128.0) * (H / 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += slice;
      }
      ctx.lineTo(W, H / 2);
      ctx.stroke();
    };
    draw();
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    drawFlatLine();
  }, [drawFlatLine]);

  useEffect(() => {
    drawFlatLine();
    return () => cleanup();
  }, [drawFlatLine, cleanup]);

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setShowFallback(true);
      showToast('Browser Anda tidak mendukung perekaman langsung. Gunakan file upload di bawah.', 'error');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setShowFallback(true);
      showToast('Browser Anda tidak mendukung MediaRecorder. Gunakan file upload di bawah.', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
      });
      streamRef.current = stream;
    } catch (err) {
      const e = err as DOMException;
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        showToast('Izin mikrofon ditolak. Buka pengaturan browser → izinkan akses mikrofon, lalu muat ulang halaman.', 'error');
        setShowFallback(true);
      } else {
        showToast('Gagal mengakses mikrofon: ' + e.message, 'error');
      }
      return;
    }

    const mimeOrder = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
    let selectedMime = '';
    for (const m of mimeOrder) {
      if (MediaRecorder.isTypeSupported(m)) {
        selectedMime = m;
        break;
      }
    }

    chunksRef.current = [];
    secondsRef.current = 0;
    setSeconds(0);

    try {
      recorderRef.current = new MediaRecorder(streamRef.current!, selectedMime ? { mimeType: selectedMime } : {});
    } catch (e) {
      showToast('Gagal membuat MediaRecorder: ' + (e instanceof Error ? e.message : ''), 'error');
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }

    const selectedMimeFinal = selectedMime;
    recorderRef.current.ondataavailable = (ev) => {
      if (ev.data?.size) chunksRef.current.push(ev.data);
    };

    recorderRef.current.onstop = () => {
      const mime = recorderRef.current?.mimeType || selectedMimeFinal || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mime });
      let ext = 'webm';
      if (mime.includes('mp4') || mime.includes('m4a')) ext = 'm4a';
      else if (mime.includes('ogg')) ext = 'ogg';
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const file = new File([blob], `rekaman_${stamp}.${ext}`, { type: mime });

      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      if (files.length >= MAX_CAPTURED_MEDIA) {
        showToast(`Maksimal ${MAX_CAPTURED_MEDIA} file per pengumpulan.`, 'error');
        setHint('Tekan tombol untuk mulai merekam');
        setRecording(false);
        cleanup();
        return;
      }

      onAddFile(file);
      const sizeMB = (file.size / 1024 / 1024).toFixed(2);
      showToast(`Rekaman selesai! Durasi: ${formatTime(secondsRef.current)} • Ukuran: ${sizeMB} MB`, 'success');
      setHint('Rekaman tersimpan. Tekan lagi untuk rekam tambahan.');
      setRecording(false);
      setSeconds(0);
      cleanup();
    };

    recorderRef.current.onerror = () => {
      showToast('Error rekaman', 'error');
      stopRecording();
    };

    recorderRef.current.start(100);
    setRecording(true);
    setHint('⏺ Merekam… Tekan lagi untuk berhenti');

    try {
      audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const src = audioCtxRef.current.createMediaStreamSource(streamRef.current!);
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      src.connect(analyserRef.current);
      drawWaveform();
    } catch {
      drawFlatLine();
    }

    timerRef.current = setInterval(() => {
      secondsRef.current++;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= 600) stopRecording();
    }, 1000);
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    cleanup();
    setRecording(false);
  }

  async function toggleRecording() {
    if (recording) stopRecording();
    else await startRecording();
  }

  async function handleFallback(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const validation = validateMediaFile(file, 'audio');
    if (!validation.ok) {
      setFormatError(validation.errorMsg!);
      return;
    }
    if (files.length >= MAX_CAPTURED_MEDIA) {
      showToast(`Maksimal ${MAX_CAPTURED_MEDIA} file per pengumpulan.`, 'error');
      return;
    }
    onAddFile(file);
  }

  return (
    <>
      <style>{`
        @keyframes recPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(192,57,43,0.35); }
          50% { box-shadow: 0 0 0 12px rgba(192,57,43,0); }
        }
        .recorder-btn-active {
          border-color: var(--error) !important;
          background: #fee2e2 !important;
          animation: recPulse 1.4s ease-in-out infinite;
        }
        .recorder-dot-active {
          width: 18px !important;
          height: 18px !important;
          border-radius: 4px !important;
        }
      `}</style>
      <div id="inBrowserAudioRecorder" style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg)', marginBottom: 8 }}>
        <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 14px' }}>
          <canvas ref={canvasRef} width={600} height={56} style={{ width: '100%', height: 56, display: 'block', borderRadius: 4 }} />
        </div>
        <div style={{ padding: '18px 16px', textAlign: 'center' }}>
          <div
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 32,
              fontWeight: 500,
              color: recording ? 'var(--error)' : 'var(--text)',
              letterSpacing: '0.04em',
              marginBottom: 6,
            }}
          >
            {formatTime(seconds)}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 18 }}>{hint}</div>
          <button
            type="button"
            className={recording ? 'recorder-btn-active' : ''}
            onClick={toggleRecording}
            title="Mulai / Berhenti"
            style={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              border: '3px solid var(--border)',
              background: 'var(--surface)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
            }}
          >
            <div
              className={recording ? 'recorder-dot-active' : ''}
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'var(--error)',
                transition: 'all 0.2s',
              }}
            />
          </button>
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 12 }}>Maks. rekaman: 10 menit</p>
        </div>
        {showFallback && (
          <div id="audioFallback" style={{ padding: '0 16px 16px' }}>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>Atau unggah file audio:</p>
              <input
                type="file"
                accept="audio/*,.m4a,.mp3,.aac,.ogg,.wav,.flac,.webm"
                onChange={handleFallback}
                style={{ fontSize: 12, width: '100%' }}
              />
            </div>
          </div>
        )}
      </div>
      <FormatErrorModal open={!!formatError} message={formatError || ''} type="audio" onClose={() => setFormatError(null)} />
    </>
  );
}
