import { Mp3Encoder } from 'lamejs';

export const MAX_CAPTURED_MEDIA = 20;
export const AUDIO_OUTPUT_MIME = 'audio/mpeg';
export const AUDIO_OUTPUT_EXT = 'mp3';

const HEIC_MIME = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const HEIC_EXT = new Set(['heic', 'heif']);
const UNSUPPORTED_AUDIO_MIME = new Set(['audio/amr', 'audio/x-amr']);
const UNSUPPORTED_AUDIO_EXT = new Set(['amr', 'wma', 'aiff', 'au', 'ra', 'rm']);

export type SubmissionMediaType = 'image' | 'video' | 'audio';

export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/** Dipakai saat unduh: ekstensi dari Content-Type (tanpa titik). */
export function extensionFromMimeType(mimeType: string): string {
  const mime = (mimeType || '').split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
    'video/quicktime': 'mov',
    'video/x-m4v': 'm4v',
    'video/3gpp': '3gp',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/x-aac': 'aac',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/webm': 'webm',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
    'audio/3gpp': '3gp',
  };
  return map[mime] || '';
}

function getFileExt(file: File) {
  const fromName = file.name ? file.name.split('.').pop()!.toLowerCase() : '';
  const fromMime = extensionFromMimeType(file.type);
  return fromName || fromMime;
}

function isHeicFile(file: File) {
  if (HEIC_MIME.has(file.type)) return true;
  return HEIC_EXT.has(getFileExt(file));
}

export function validateMediaFile(file: File, type: SubmissionMediaType): { ok: boolean; errorMsg?: string } {
  const sizeMB = file.size / 1024 / 1024;
  const ext = getFileExt(file);
  const mime = file.type || '';

  if (type === 'image') {
    if (isHeicFile(file)) {
      return {
        ok: false,
        errorMsg:
          'Format HEIC/HEIF tidak didukung oleh browser. Buka aplikasi Foto di iPhone Anda, pilih foto, lalu klik "Share" → "Copy Photo" atau simpan ulang sebagai JPEG sebelum mengirim.',
      };
    }
    if (sizeMB > 50) {
      return { ok: false, errorMsg: `Ukuran foto terlalu besar (${sizeMB.toFixed(0)}MB, maks 50MB).` };
    }
    if (mime && !mime.startsWith('image/')) {
      return { ok: false, errorMsg: `File bukan gambar (${mime || ext}). Harap pilih file gambar (JPG, PNG, WebP).` };
    }
    return { ok: true };
  }

  if (type === 'video') {
    if (sizeMB > 100) {
      return {
        ok: false,
        errorMsg: `Video terlalu besar (${sizeMB.toFixed(0)}MB, maks 100MB). Harap rekam video lebih pendek.`,
      };
    }
    const blockedExt = new Set(['flv', 'wmv', 'asf', 'rm', 'rmvb']);
    if (blockedExt.has(ext)) {
      return { ok: false, errorMsg: `Format video .${ext} tidak didukung. Harap gunakan format MP4, MOV, atau WebM.` };
    }
    return { ok: true };
  }

  if (type === 'audio') {
    if (sizeMB > 100) {
      return { ok: false, errorMsg: `File audio terlalu besar (${sizeMB.toFixed(0)}MB, maks 100MB).` };
    }
    if (UNSUPPORTED_AUDIO_EXT.has(ext) || UNSUPPORTED_AUDIO_MIME.has(mime)) {
      return {
        ok: false,
        errorMsg: `Format audio .${ext} tidak dapat dibaca. Coba MP3, M4A, AAC, OGG, WAV, atau rekam langsung di aplikasi.`,
      };
    }
    return { ok: true };
  }

  return { ok: true };
}

export const FORMAT_TIPS: Record<SubmissionMediaType, string[]> = {
  image: [
    'Gunakan format JPG, PNG, atau WebP.',
    'Jika foto dari iPhone (HEIC), buka Pengaturan → Kamera → Format → Paling Kompatibel, lalu foto ulang.',
  ],
  video: ['Gunakan format MP4 atau MOV.', 'Rekam langsung dari kamera HP untuk hasil terbaik.'],
  audio: [
    'Semua audio akan disimpan sebagai MP3.',
    'Anda boleh rekam di aplikasi atau unggah M4A/WebM/WAV — akan dikonversi otomatis.',
  ],
};

function floatTo16(channel: Float32Array): Int16Array {
  const out = new Int16Array(channel.length);
  for (let i = 0; i < channel.length; i++) {
    const s = Math.max(-1, Math.min(1, channel[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function mp3OutputName(file: File) {
  const base = file.name.replace(/\.[^/.]+$/, '') || `audio_${Date.now()}`;
  return `${base}.${AUDIO_OUTPUT_EXT}`;
}

/** Konversi semua audio kiriman siswa ke MP3 (upload & unduhan seragam). */
export async function convertAudioToMp3(file: File, kbps = 128): Promise<File> {
  const ext = getFileExt(file);
  if (
    (file.type === AUDIO_OUTPUT_MIME || file.type === 'audio/mp3') &&
    ext === AUDIO_OUTPUT_EXT
  ) {
    return new File([file], mp3OutputName(file), { type: AUDIO_OUTPUT_MIME });
  }

  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new AudioContext();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await audioCtx.close();
  }

  const channels = Math.min(audioBuffer.numberOfChannels, 2);
  const sampleRate = audioBuffer.sampleRate;
  const left = floatTo16(audioBuffer.getChannelData(0));
  const right =
    channels > 1 ? floatTo16(audioBuffer.getChannelData(1)) : left;

  const encoder = new Mp3Encoder(channels, sampleRate, kbps);
  const blockSize = 1152;
  const parts: BlobPart[] = [];

  for (let i = 0; i < left.length; i += blockSize) {
    const leftChunk = left.subarray(i, i + blockSize);
    const rightChunk = right.subarray(i, i + blockSize);
    const buf =
      channels > 1
        ? encoder.encodeBuffer(leftChunk, rightChunk)
        : encoder.encodeBuffer(leftChunk);
    if (buf.length > 0) parts.push(new Uint8Array(buf));
  }

  const tail = encoder.flush();
  if (tail.length > 0) parts.push(new Uint8Array(tail));

  if (!parts.length) {
    throw new Error('Konversi ke MP3 gagal (audio kosong atau tidak terbaca).');
  }

  const blob = new Blob(parts, { type: AUDIO_OUTPUT_MIME });
  return new File([blob], mp3OutputName(file), { type: AUDIO_OUTPUT_MIME });
}

/** @deprecated Gunakan convertAudioToMp3 */
export async function normalizeAudioFile(file: File): Promise<File> {
  return convertAudioToMp3(file);
}

export async function compressImage(file: File, maxDimension = 1200, quality = 0.7): Promise<File> {
  if (isHeicFile(file)) {
    throw new Error('Format HEIC/HEIF tidak didukung. Harap konversi ke JPG/PNG terlebih dahulu.');
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height / width) * maxDimension);
          width = maxDimension;
        } else {
          width = Math.round((width / height) * maxDimension);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const isPng = file.type === 'image/png';
      const outputMime = isPng && file.size < 2 * 1024 * 1024 ? 'image/png' : 'image/jpeg';
      const outputExt = outputMime === 'image/png' ? 'png' : 'jpg';
      const outputQuality = outputMime === 'image/png' ? undefined : quality;

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Kompresi gambar gagal. Coba format JPG atau PNG.'));
          const baseName = file.name.replace(/\.[^/.]+$/, '') || `foto_${Date.now()}`;
          resolve(new File([blob], `${baseName}.${outputExt}`, { type: outputMime }));
        },
        outputMime,
        outputQuality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          `Format gambar tidak dapat dibaca (${file.type || getFileExt(file) || 'unknown'}). Gunakan JPG, PNG, atau WebP.`,
        ),
      );
    };
    img.src = url;
  });
}

export async function compressVideo(file: File): Promise<File> {
  if (file.size > 300 * 1024 * 1024) {
    throw new Error('Video terlalu besar (maks 300MB). Harap rekam video yang lebih pendek.');
  }

  if (file.size < 5 * 1024 * 1024) {
    const ext = getFileExt(file);
    const mimeExt = extensionFromMimeType(file.type);
    if (ext !== mimeExt && mimeExt) {
      const baseName = file.name.replace(/\.[^/.]+$/, '') || `video_${Date.now()}`;
      return new File([file], `${baseName}.${mimeExt}`, { type: file.type });
    }
    return file;
  }

  if (typeof MediaRecorder === 'undefined') {
    console.warn('MediaRecorder tidak tersedia, video dikirim tanpa kompresi');
    return file;
  }

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const mimePreferenceIOS = ['video/mp4;codecs=avc1', 'video/mp4'];
  const mimePreferenceGeneral = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8,vorbis',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];
  const mimeOrder = isIOS ? mimePreferenceIOS : mimePreferenceGeneral;
  let selectedMime = '';
  for (const mime of mimeOrder) {
    if (MediaRecorder.isTypeSupported(mime)) {
      selectedMime = mime;
      break;
    }
  }
  if (!selectedMime) {
    console.warn('Tidak ada MIME type video yang didukung untuk kompresi, video dikirim apa adanya');
    return file;
  }

  return new Promise((resolve, reject) => {
    const videoUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    let videoUrlRevoked = false;
    const revokeVideoUrl = () => {
      if (!videoUrlRevoked) {
        URL.revokeObjectURL(videoUrl);
        videoUrlRevoked = true;
      }
    };
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoUrl;

    video.onloadedmetadata = async () => {
      try {
        const MAX_WIDTH = 720;
        const MAX_HEIGHT = 720;
        let targetWidth = video.videoWidth;
        let targetHeight = video.videoHeight;

        if (targetWidth > MAX_WIDTH) {
          const scale = MAX_WIDTH / targetWidth;
          targetWidth = MAX_WIDTH;
          targetHeight = Math.round(targetHeight * scale);
        }
        if (targetHeight > MAX_HEIGHT) {
          const scale = MAX_HEIGHT / targetHeight;
          targetHeight = MAX_HEIGHT;
          targetWidth = Math.round(targetWidth * scale);
        }

        targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
        targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d')!;
        const canvasStream = canvas.captureStream(24);

        const audioVideo = document.createElement('video');
        audioVideo.src = videoUrl;
        audioVideo.playsInline = true;
        audioVideo.preload = 'auto';
        audioVideo.volume = 0;

        let combinedStream: MediaStream;
        let audioCtx: AudioContext | null = null;
        const closeAudioCtx = () => {
          if (audioCtx && audioCtx.state !== 'closed') {
            audioCtx.close().catch(() => {});
          }
          audioCtx = null;
        };

        try {
          await new Promise<void>((res, rej) => {
            audioVideo.onloadedmetadata = () => res();
            audioVideo.onerror = () => rej(new Error('audio load'));
            setTimeout(() => rej(new Error('audio timeout')), 10000);
          });

          let audioStream: MediaStream | null = null;
          const av = audioVideo as HTMLVideoElement & {
            captureStream?: () => MediaStream;
            mozCaptureStream?: () => MediaStream;
          };
          if (typeof av.captureStream === 'function') {
            audioStream = av.captureStream();
          } else if (typeof av.mozCaptureStream === 'function') {
            audioStream = av.mozCaptureStream();
          }

          if (audioStream) {
            const audioTracks = audioStream.getAudioTracks();
            if (audioTracks.length > 0) {
              combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
            } else {
              combinedStream = canvasStream;
            }
          } else {
            try {
              audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
              const source = audioCtx.createMediaElementSource(audioVideo);
              const destination = audioCtx.createMediaStreamDestination();
              source.connect(destination);
              const audioTracks = destination.stream.getAudioTracks();
              if (audioTracks.length > 0) {
                combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
              } else {
                combinedStream = canvasStream;
              }
            } catch {
              combinedStream = canvasStream;
            }
          }
        } catch {
          combinedStream = canvasStream;
        }

        const recorder = new MediaRecorder(combinedStream, {
          mimeType: selectedMime,
          videoBitsPerSecond: 800000,
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          revokeVideoUrl();
          closeAudioCtx();
          const blob = new Blob(chunks, { type: selectedMime });
          const ext = selectedMime.includes('mp4') ? 'mp4' : 'webm';
          const baseName = file.name.replace(/\.[^/.]+$/, '') || `video_${Date.now()}`;
          resolve(new File([blob], `${baseName}_compressed.${ext}`, { type: selectedMime.split(';')[0] }));
        };

        recorder.onerror = (e) => {
          revokeVideoUrl();
          closeAudioCtx();
          reject(new Error('MediaRecorder error: ' + (e as Event & { error?: unknown }).error));
        };

        recorder.start(100);
        video.play();
        audioVideo.play().catch(() => {});

        const drawFrame = () => {
          if (video.paused || video.ended) return;
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          requestAnimationFrame(drawFrame);
        };
        requestAnimationFrame(drawFrame);

        video.onended = () => {
          audioVideo.pause();
          recorder.stop();
          combinedStream.getTracks().forEach((t) => t.stop());
        };

        setTimeout(() => {
          if (recorder.state === 'recording') {
            video.pause();
            audioVideo.pause();
            recorder.stop();
            combinedStream.getTracks().forEach((t) => t.stop());
          }
          revokeVideoUrl();
          closeAudioCtx();
        }, 3 * 60 * 1000);
      } catch (err) {
        revokeVideoUrl();
        reject(err);
      }
    };

    video.onerror = () => {
      revokeVideoUrl();
      const mediaErr = video.error;
      const detail = mediaErr ? ` (kode: ${mediaErr.code}, ${mediaErr.message || ''})` : '';
      reject(new Error('Gagal memuat video' + detail));
    };
  });
}

export async function processCapturedFile(
  file: File,
  type: SubmissionMediaType,
): Promise<File> {
  if (type === 'image') return compressImage(file, 1200, 0.7);
  if (type === 'video') return compressVideo(file);
  return convertAudioToMp3(file);
}

export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
