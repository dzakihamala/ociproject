// app.js - Logika Utama Aplikasi

// ==========================================
// API CLIENT (menggantikan Supabase SDK)
// ==========================================

function getToken() {
    return localStorage.getItem('auth_token');
}

function setToken(token) {
    localStorage.setItem('auth_token', token);
}

function clearToken() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('teacher_id');
}

function setTeacherId(id) {
    localStorage.setItem('teacher_id', id);
}

function getTeacherId() {
    return localStorage.getItem('teacher_id');
}

async function apiRequest(path, options = {}) {
    const token = getToken();
    const headers = { ...(options.headers || {}) };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Only set Content-Type to JSON if body is NOT FormData
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        clearToken();
        window.location.href = 'index.html';
        throw new Error('Sesi berakhir, silakan login kembali.');
    }

    if (response.status === 204 || response.headers.get('Content-Length') === '0') {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return {};
    }

    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return {};
    }

    let data;
    try {
        data = await response.json();
    } catch (parseError) {
        throw new Error(`Server mengembalikan respons tidak valid (HTTP ${response.status}). Coba lagi nanti.`);
    }
    if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
}

// ==========================================
// FUNGSI UMUM & UTILITY
// ==========================================

function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

let capturedMedia = [];
const MAX_CAPTURED_MEDIA = 20;
let currentSubmissionType = 'image';
let currentTaskId = null;
let currentTaskCode = null;
const _downloadData = [];
const _mediaBlobUrls = new WeakMap(); // cache blob URLs per file object

// ==========================================
// FORMAT SUPPORT & VALIDATION
// ==========================================

// Formats supported by canvas (for compression)
const SUPPORTED_IMAGE_MIME = new Set([
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'image/gif', 'image/bmp', 'image/svg+xml', 'image/tiff', 'image/x-tiff'
]);

// HEIC/HEIF: Not decodable in most browsers without a library
const HEIC_MIME = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const HEIC_EXT = new Set(['heic', 'heif']);

// Video formats that browsers can decode for canvas re-encoding
const SUPPORTED_VIDEO_MIME = new Set([
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
    'video/x-m4v', 'video/3gpp', 'video/3gpp2', 'video/mpeg',
    'video/x-msvideo', 'video/x-matroska', 'video/x-flv'
]);

// Audio formats playable in <audio> element
const SUPPORTED_AUDIO_MIME = new Set([
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a',
    'audio/aac', 'audio/x-aac', 'audio/ogg', 'audio/wav', 'audio/wave',
    'audio/x-wav', 'audio/webm', 'audio/flac', 'audio/x-flac',
    'audio/3gpp', 'audio/3gpp2'
]);

// Audio formats NOT playable in browsers
const UNSUPPORTED_AUDIO_MIME = new Set(['audio/amr', 'audio/x-amr']);
const UNSUPPORTED_AUDIO_EXT = new Set(['amr', 'wma', 'aiff', 'au', 'ra', 'rm']);

/**
 * Get file extension from MIME type for proper naming
 */
function getExtFromMime(mimeType) {
    const map = {
        'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
        'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp',
        'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv',
        'video/quicktime': 'mov', 'video/x-m4v': 'm4v', 'video/3gpp': '3gp',
        'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a',
        'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac',
        'audio/x-aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
        'audio/wave': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm',
        'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/3gpp': '3gp',
    };
    return map[mimeType] || '';
}

/**
 * Get file extension from file object (from name or MIME)
 */
function getFileExt(file) {
    const fromName = file.name ? file.name.split('.').pop().toLowerCase() : '';
    const fromMime = getExtFromMime(file.type);
    return fromName || fromMime;
}

/**
 * Detect if this is a HEIC/HEIF image
 */
function isHeicFile(file) {
    if (HEIC_MIME.has(file.type)) return true;
    const ext = getFileExt(file);
    return HEIC_EXT.has(ext);
}

/**
 * Validate a media file before processing. Returns { ok, errorMsg }.
 */
function validateMediaFile(file, type) {
    const sizeMB = file.size / 1024 / 1024;
    const ext = getFileExt(file);
    const mime = file.type || '';

    if (type === 'image') {
        if (isHeicFile(file)) {
            return {
                ok: false,
                errorMsg: 'Format HEIC/HEIF tidak didukung oleh browser. Buka aplikasi Foto di iPhone Anda, pilih foto, lalu klik "Share" → "Copy Photo" atau simpan ulang sebagai JPEG sebelum mengirim.'
            };
        }
        if (sizeMB > 50) {
            return { ok: false, errorMsg: `Ukuran foto terlalu besar (${sizeMB.toFixed(0)}MB, maks 50MB).` };
        }
        // Try to check if it's a valid image type; if mime is empty assume ok (some browsers don't set it)
        if (mime && !mime.startsWith('image/')) {
            return { ok: false, errorMsg: `File bukan gambar (${mime || ext}). Harap pilih file gambar (JPG, PNG, WebP).` };
        }
        return { ok: true };
    }

    if (type === 'video') {
        if (sizeMB > 100) {
            return { ok: false, errorMsg: `Video terlalu besar (${sizeMB.toFixed(0)}MB, maks 100MB). Harap rekam video lebih pendek.` };
        }
        // Block formats that can't be decoded by browser canvas (typically)
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
                errorMsg: `Format audio .${ext} tidak dapat diputar di browser. Harap gunakan format MP3, M4A, AAC, OGG, atau WAV.`
            };
        }
        return { ok: true };
    }

    return { ok: true };
}

/**
 * Normalise audio file: renames file with proper extension based on MIME type.
 * Returns a new File if needed, otherwise the original.
 */
function normalizeAudioFile(file) {
    let mime = file.type || '';
    const nameExt = getFileExt(file);

    // 3GP files are often reported as video/3gpp by browsers even when they are audio-only.
    // Correct the MIME type so R2 serves them properly for <audio> playback.
    if ((mime === 'video/3gpp' || mime === 'video/3gpp2') && nameExt === '3gp') {
        mime = 'audio/3gpp';
    }

    const mimeExt = getExtFromMime(mime);

    // If the file name extension doesn't match MIME, rename it for storage clarity
    if (mimeExt && nameExt !== mimeExt) {
        const baseName = file.name.replace(/\.[^/.]+$/, '') || `audio_${Date.now()}`;
        return new File([file], `${baseName}.${mimeExt}`, { type: mime || `audio/${mimeExt}` });
    }

    // If MIME was corrected from video to audio, recreate the file with correct MIME
    if (mime !== file.type) {
        return new File([file], file.name || `audio_${Date.now()}.3gp`, { type: mime });
    }

    // If file has no extension, add one from MIME
    if (!nameExt && mimeExt) {
        return new File([file], `audio_${Date.now()}.${mimeExt}`, { type: mime });
    }

    return file;
}

function closePhotoPreview() {
    window.__photoPreviewOpen = false;
    const overlay = document.getElementById('photoPreviewOverlay');
    if (overlay) overlay.remove();
}

function previewPhoto(url, index) {
    let overlay = document.getElementById('photoPreviewOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'photoPreviewOverlay';
        overlay.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
        overlay.onclick = () => { history.back(); };
        const inner = document.createElement('div');
        inner.style = 'position:relative;max-width:90vw;max-height:90vh;';
        const img = document.createElement('img');
        img.id = 'photoPreviewImg';
        img.style = 'max-width:100%;max-height:85vh;border-radius:4px;';
        const caption = document.createElement('div');
        caption.id = 'photoPreviewCaption';
        caption.style = 'text-align:center;color:#fff;font-size:13px;margin-top:8px;';
        inner.appendChild(img);
        inner.appendChild(caption);
        overlay.appendChild(inner);
        document.body.appendChild(overlay);
    }
    document.getElementById('photoPreviewImg').src = url;
    document.getElementById('photoPreviewCaption').textContent = `Halaman ${index + 1}`;

    window.__photoPreviewOpen = true;
    history.pushState({ preview: true }, '');
}

function previewUrl(url, caption) {
    let overlay = document.getElementById('photoPreviewOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'photoPreviewOverlay';
        overlay.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
        overlay.onclick = () => { history.back(); };
        const inner = document.createElement('div');
        inner.style = 'position:relative;max-width:90vw;max-height:90vh;';
        const img = document.createElement('img');
        img.id = 'photoPreviewImg';
        img.style = 'max-width:100%;max-height:85vh;border-radius:4px;';
        const captionEl = document.createElement('div');
        captionEl.id = 'photoPreviewCaption';
        captionEl.style = 'text-align:center;color:#fff;font-size:13px;margin-top:8px;';
        inner.appendChild(img);
        inner.appendChild(captionEl);
        overlay.appendChild(inner);
        document.body.appendChild(overlay);
    }
    document.getElementById('photoPreviewImg').src = url;
    document.getElementById('photoPreviewCaption').textContent = caption || '';

    window.__photoPreviewOpen = true;
    history.pushState({ preview: true }, '');
}

// Listen for back button to close preview overlay only when it is open
window.addEventListener('popstate', function () {
    if (window.__photoPreviewOpen) {
        closePhotoPreview();
    }
});

// ==========================================
// UNIFIED MEDIA CAPTURE (image/video/audio)
// ==========================================

async function handleMediaCapture(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    if (capturedMedia.length >= MAX_CAPTURED_MEDIA) {
        showAlert(`Maksimal ${MAX_CAPTURED_MEDIA} file per pengumpulan.`, 'error');
        return;
    }

    const type = currentSubmissionType;
    const typeLabels = { image: 'foto', video: 'video', audio: 'audio' };
    const typeIcons = { image: '📷', video: '🎥', audio: '🎙️' };
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);

    // --- Format validation before any processing ---
    const validation = validateMediaFile(file, type);
    if (!validation.ok) {
        showFormatError(validation.errorMsg, type);
        return;
    }

    try {
        let processedFile = file;
        if (type === 'image') {
            const formatHint = escHTML((file.type || getFileExt(file) || 'unknown').replace('image/', ''));
            showMediaProcessing(typeIcons[type], `Mengompresi ${typeLabels[type]}...`, `Ukuran asli: ${sizeMB}MB • Format: ${formatHint}`);
            processedFile = await compressImage(file, 1200, 0.7);
        } else if (type === 'video') {
            const formatLabel = escHTML((file.type || getFileExt(file) || 'video').replace('video/', '').toUpperCase());
            if (file.size >= 5 * 1024 * 1024) {
                showMediaProcessing(typeIcons[type], `Mengompresi video (${sizeMB}MB)...`, `Format: ${formatLabel} • Mohon tunggu, jangan tutup halaman.`);
            } else {
                showMediaProcessing(typeIcons[type], `Memproses video...`, `Ukuran: ${sizeMB}MB • Format: ${formatLabel}`);
            }
            processedFile = await compressVideo(file);
        } else if (type === 'audio') {
            const formatLabel = escHTML((file.type || getFileExt(file) || 'audio').replace('audio/', '').toUpperCase());
            showMediaProcessing(typeIcons[type], `Memproses audio...`, `Ukuran: ${sizeMB}MB • Format: ${formatLabel}`);
            await new Promise(r => setTimeout(r, 400));
            processedFile = normalizeAudioFile(file);
        }

        hideMediaProcessing();
        capturedMedia.push(processedFile);
        renderMediaPreviews();

        // Show result info
        const resultMB = (processedFile.size / 1024 / 1024).toFixed(1);
        if (type !== 'audio' && processedFile !== file) {
            const saved = ((1 - processedFile.size / file.size) * 100).toFixed(0);
            showAlert(`${typeLabels[type].charAt(0).toUpperCase() + typeLabels[type].slice(1)} berhasil diproses! ${sizeMB}MB → ${resultMB}MB (${saved}% lebih kecil)`, 'success');
        } else {
            showAlert(`${typeLabels[type].charAt(0).toUpperCase() + typeLabels[type].slice(1)} berhasil ditambahkan!`, 'success');
        }
    } catch (e) {
        console.error(e);
        hideMediaProcessing();
        // Provide more specific error messages
        if (e.message && e.message.includes('decode')) {
            showFormatError(`Format ${typeLabels[type]} tidak dapat dibaca. Coba format lain (${type === 'video' ? 'MP4, MOV' : type === 'audio' ? 'MP3, M4A, AAC' : 'JPG, PNG, WebP'}).`, type);
        } else {
            showAlert(`Gagal memproses ${typeLabels[type]}: ${e.message || 'Error tidak diketahui'}`, 'error');
        }
    }
}

/**
 * Show a user-friendly modal error for format issues, with tips.
 */
function showFormatError(message, type) {
    const tips = {
        image: ['Gunakan format JPG, PNG, atau WebP.', 'Jika foto dari iPhone (HEIC), buka Pengaturan → Kamera → Format → Paling Kompatibel, lalu foto ulang.'],
        video: ['Gunakan format MP4 atau MOV.', 'Rekam langsung dari kamera HP untuk hasil terbaik.'],
        audio: ['Gunakan format MP3, M4A, AAC, OGG, atau WAV.', 'Rekam langsung dari aplikasi perekam HP.'],
    };
    const tipList = (tips[type] || []).map(t => `<li style="margin-bottom:4px;">${t}</li>`).join('');

    // Remove existing error modal if any
    const existing = document.getElementById('formatErrorModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'formatErrorModal';
    modal.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:3500;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
        <div style="background:var(--surface);border-radius:8px;padding:24px;max-width:400px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.15);">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                <span style="font-size:24px;">⚠️</span>
                <h3 style="font-size:15px;font-weight:600;color:var(--error);">Format Tidak Didukung</h3>
            </div>
            <p style="font-size:13px;color:var(--text-2);margin-bottom:14px;line-height:1.6;">${escHTML(message)}</p>
            ${tipList ? `<div style="background:var(--bg);border-radius:6px;padding:12px 14px;margin-bottom:16px;"><p style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">💡 Tips:</p><ul style="font-size:12px;color:var(--text-2);padding-left:16px;line-height:1.6;">${tipList}</ul></div>` : ''}
            <button onclick="document.getElementById('formatErrorModal').remove()" class="btn btn-accent" style="width:100%;">Mengerti</button>
        </div>
    `;
    document.body.appendChild(modal);
}

function renderMediaPreviews() {
    const container = document.getElementById('mediaPreviewContainer');
    if (!container) return;

    // Revoke blob URLs for files that were removed from capturedMedia
    container.querySelectorAll('img, video').forEach(el => {
        if (el.src && el.src.startsWith('blob:')) {
            const stillExists = capturedMedia.some(f => _mediaBlobUrls.get(f) === el.src);
            if (!stillExists) URL.revokeObjectURL(el.src);
        }
    });
    container.innerHTML = '';

    capturedMedia.forEach((file, index) => {
        // Reuse cached blob URL or create a new one
        let url = _mediaBlobUrls.get(file);
        if (!url) {
            url = URL.createObjectURL(file);
            _mediaBlobUrls.set(file, url);
        }
        const type = currentSubmissionType;

        const wrap = document.createElement('div');
        wrap.className = 'media-preview-item';

        // Remove button
        const btn = document.createElement('button');
        btn.innerHTML = '&times;';
        btn.className = 'media-remove';
        btn.onclick = (e) => {
            e.stopPropagation();
            const idx = capturedMedia.indexOf(file);
            if (idx !== -1) capturedMedia.splice(idx, 1);
            renderMediaPreviews();
        };
        wrap.appendChild(btn);

        if (type === 'image') {
            const img = document.createElement('img');
            img.src = url;
            img.style = 'width:100%;height:100%;object-fit:cover;';
            img.onclick = () => previewPhoto(url, index);
            wrap.appendChild(img);
        } else if (type === 'video') {
            const vid = document.createElement('video');
            vid.src = url;
            vid.muted = true;
            vid.preload = 'metadata';
            vid.onloadeddata = () => { vid.currentTime = 0.5; };
            wrap.appendChild(vid);
            const playOv = document.createElement('div');
            playOv.className = 'play-overlay';
            wrap.appendChild(playOv);
            wrap.onclick = () => previewMediaOverlay(url, 'video', index);
        } else if (type === 'audio') {
            const icon = document.createElement('div');
            icon.className = 'media-icon';
            icon.textContent = '🎵';
            wrap.appendChild(icon);
            wrap.onclick = () => previewMediaOverlay(url, 'audio', index);
        }

        // Label
        const label = document.createElement('div');
        label.className = 'media-label';
        label.textContent = `${index + 1}`;
        wrap.appendChild(label);

        container.appendChild(wrap);
    });
}

function previewMediaOverlay(url, type, index) {
    let overlay = document.getElementById('photoPreviewOverlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'photoPreviewOverlay';
    overlay.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:2000;display:flex;align-items:center;justify-content:center;flex-direction:column;';

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style = 'position:absolute;top:12px;right:16px;background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:24px;width:40px;height:40px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;transition:background 0.15s;';
    closeBtn.onmouseenter = () => { closeBtn.style.background = 'rgba(255,255,255,0.3)'; };
    closeBtn.onmouseleave = () => { closeBtn.style.background = 'rgba(255,255,255,0.15)'; };
    closeBtn.onclick = (e) => { e.stopPropagation(); history.back(); };
    overlay.appendChild(closeBtn);

    const inner = document.createElement('div');
    inner.style = 'position:relative;max-width:92vw;max-height:85vh;width:100%;text-align:center;padding:0 8px;';
    inner.onclick = (e) => { e.stopPropagation(); }; // Prevent closing when clicking content

    if (type === 'video') {
        const vid = document.createElement('video');
        vid.src = url;
        vid.controls = true;
        vid.autoplay = true;
        vid.playsInline = true;
        vid.style = 'max-width:100%;max-height:78vh;border-radius:8px;background:#000;box-shadow:0 4px 24px rgba(0,0,0,0.5);';
        inner.appendChild(vid);
    } else {
        const audioWrap = document.createElement('div');
        audioWrap.style = 'background:rgba(255,255,255,0.08);border-radius:12px;padding:32px 24px;max-width:400px;margin:0 auto;';
        const icon = document.createElement('div');
        icon.textContent = '🎵';
        icon.style = 'font-size:48px;margin-bottom:16px;';
        audioWrap.appendChild(icon);
        const audio = document.createElement('audio');
        audio.src = url;
        audio.controls = true;
        audio.autoplay = true;
        audio.style = 'width:100%;';
        audioWrap.appendChild(audio);
        inner.appendChild(audioWrap);
    }

    const caption = document.createElement('div');
    caption.style = 'text-align:center;color:rgba(255,255,255,0.7);font-size:13px;margin-top:12px;font-weight:500;';
    caption.textContent = type === 'video' ? `Video ${index + 1}` : `Audio ${index + 1}`;
    inner.appendChild(caption);

    overlay.appendChild(inner);
    overlay.onclick = (e) => { if (e.target === overlay) history.back(); };
    document.body.appendChild(overlay);
    history.pushState({ preview: true }, '');
}

async function compressVideo(file) {
    // Batas ukuran file
    if (file.size > 300 * 1024 * 1024) {
        showAlert('Video terlalu besar (maks 300MB). Harap rekam video yang lebih pendek.', 'error');
        throw new Error('Video terlalu besar');
    }

    // Jika file sudah kecil (< 5MB), tidak perlu dikompresi
    if (file.size < 5 * 1024 * 1024) {
        // Still normalise extension for web compatibility
        const ext = getFileExt(file);
        const mimeExt = getExtFromMime(file.type);
        if (ext !== mimeExt && mimeExt) {
            const baseName = file.name.replace(/\.[^/.]+$/, '') || `video_${Date.now()}`;
            return new File([file], `${baseName}.${mimeExt}`, { type: file.type });
        }
        return file;
    }

    // Cek apakah browser mendukung MediaRecorder
    if (typeof MediaRecorder === 'undefined') {
        console.warn('MediaRecorder tidak tersedia, video dikirim tanpa kompresi');
        return file;
    }

    // Deteksi iOS — iOS Safari hanya mendukung video/mp4 di MediaRecorder
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    // Tentukan MIME type yang didukung
    // Pada iOS: coba mp4 dulu; pada browser lain: coba webm dulu
    const mimePreferenceIOS = [
        'video/mp4;codecs=avc1',
        'video/mp4',
    ];
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

    showAlert('Mengompresi video... Mohon tunggu.', 'info');

    return new Promise((resolve, reject) => {
        const videoUrl = URL.createObjectURL(file);
        const video = document.createElement('video');
        let _videoUrlRevoked = false;
        function revokeVideoUrl() {
            if (!_videoUrlRevoked) { URL.revokeObjectURL(videoUrl); _videoUrlRevoked = true; }
        }
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = videoUrl;

        video.onloadedmetadata = async () => {
            try {
                // Hitung resolusi target (max 720p, pertahankan aspect ratio)
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

                // Pastikan genap (MediaRecorder membutuhkan dimensi genap)
                targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
                targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

                // Setup canvas untuk menggambar frame video
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');

                // Capture video stream dari canvas
                const canvasStream = canvas.captureStream(24); // 24 fps

                // Setup audio — buat video element kedua untuk capture audio
                const audioVideo = document.createElement('video');
                audioVideo.src = videoUrl;
                audioVideo.playsInline = true;
                audioVideo.preload = 'auto';
                audioVideo.volume = 0;

                let combinedStream;
                let audioCtx = null;
                const closeAudioCtx = () => {
                    if (audioCtx && audioCtx.state !== 'closed') {
                        audioCtx.close().catch(() => {});
                    }
                    audioCtx = null;
                };

                try {
                    await new Promise((res, rej) => {
                        audioVideo.onloadedmetadata = res;
                        audioVideo.onerror = rej;
                        setTimeout(rej, 10000);
                    });

                    let audioStream = null;
                    if (typeof audioVideo.captureStream === 'function') {
                        audioStream = audioVideo.captureStream();
                    } else if (typeof audioVideo.mozCaptureStream === 'function') {
                        audioStream = audioVideo.mozCaptureStream();
                    }

                    if (audioStream) {
                        const audioTracks = audioStream.getAudioTracks();
                        if (audioTracks.length > 0) {
                            combinedStream = new MediaStream([
                                ...canvasStream.getVideoTracks(),
                                ...audioTracks
                            ]);
                        } else {
                            combinedStream = canvasStream;
                        }
                    } else {
                        try {
                            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                            const source = audioCtx.createMediaElementSource(audioVideo);
                            const destination = audioCtx.createMediaStreamDestination();
                            source.connect(destination);
                            const audioTracks = destination.stream.getAudioTracks();
                            if (audioTracks.length > 0) {
                                combinedStream = new MediaStream([
                                    ...canvasStream.getVideoTracks(),
                                    ...audioTracks
                                ]);
                            } else {
                                combinedStream = canvasStream;
                            }
                        } catch (audioErr) {
                            console.warn('Web Audio API gagal, menggunakan canvas stream saja:', audioErr);
                            combinedStream = canvasStream;
                        }
                    }
                } catch (audioSetupErr) {
                    console.warn('Setup audio gagal, menggunakan canvas stream saja:', audioSetupErr);
                    combinedStream = canvasStream;
                }

                // Setup MediaRecorder
                const recorder = new MediaRecorder(combinedStream, {
                    mimeType: selectedMime,
                    videoBitsPerSecond: 800000 // 800kbps
                });

                const chunks = [];
                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) chunks.push(e.data);
                };

                recorder.onstop = () => {
                    revokeVideoUrl();
                    closeAudioCtx();
                    const blob = new Blob(chunks, { type: selectedMime });
                    const ext = selectedMime.includes('mp4') ? 'mp4' : 'webm';
                    const baseName = file.name.replace(/\.[^/.]+$/, '') || `video_${Date.now()}`;
                    const compressedFile = new File([blob], `${baseName}_compressed.${ext}`, { type: selectedMime.split(';')[0] });
                    resolve(compressedFile);
                };

                recorder.onerror = (e) => {
                    revokeVideoUrl();
                    closeAudioCtx();
                    reject(new Error('MediaRecorder error: ' + e.error));
                };

                // Start recording
                recorder.start(100); // collect data every 100ms

                // Play both videos in sync
                video.play();
                audioVideo.play().catch(() => { });

                // Draw frames to canvas
                const drawFrame = () => {
                    if (video.paused || video.ended) return;
                    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
                    requestAnimationFrame(drawFrame);
                };
                requestAnimationFrame(drawFrame);

                // Stop when video ends
                video.onended = () => {
                    audioVideo.pause();
                    recorder.stop();
                    combinedStream.getTracks().forEach(t => t.stop());
                };

                // Timeout safety (max 3 minutes)
                setTimeout(() => {
                    if (recorder.state === 'recording') {
                        video.pause();
                        audioVideo.pause();
                        recorder.stop();
                        combinedStream.getTracks().forEach(t => t.stop());
                    }
                    revokeVideoUrl();
                    closeAudioCtx();
                }, 3 * 60 * 1000);

            } catch (err) {
                revokeVideoUrl();
                reject(err);
            }
        };

        video.onerror = (e) => {
            revokeVideoUrl();
            const mediaErr = video.error;
            const detail = mediaErr ? ` (kode: ${mediaErr.code}, ${mediaErr.message || ''})` : '';
            reject(new Error('Gagal memuat video' + detail));
        };
    });
}

async function compressImage(file, maxDimension = 1200, quality = 0.7) {
    // Extra HEIC guard (should already be caught in validateMediaFile, but be safe)
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
            const ctx = canvas.getContext('2d');

            // Fill white background (important for PNGs with transparency → JPEG)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            // Determine output format: keep PNG for transparency if original is PNG and small enough
            const isPng = file.type === 'image/png';
            const outputMime = isPng && file.size < 2 * 1024 * 1024 ? 'image/png' : 'image/jpeg';
            const outputExt = outputMime === 'image/png' ? 'png' : 'jpg';
            const outputQuality = outputMime === 'image/png' ? undefined : quality;

            canvas.toBlob((blob) => {
                if (!blob) return reject(new Error('Kompresi gambar gagal. Coba format JPG atau PNG.'));
                const baseName = file.name.replace(/\.[^/.]+$/, '') || `foto_${Date.now()}`;
                const compressedFile = new File([blob], `${baseName}.${outputExt}`, { type: outputMime });
                resolve(compressedFile);
            }, outputMime, outputQuality);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error(`Format gambar tidak dapat dibaca (${file.type || getFileExt(file) || 'unknown'}). Gunakan JPG, PNG, atau WebP.`));
        };
        img.src = url;
    });
}

// ==========================================
// MEDIA PROCESSING OVERLAY
// ==========================================

function showMediaProcessing(icon, title, subtitle) {
    let overlay = document.getElementById('mediaProcessingOverlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'mediaProcessingOverlay';
    overlay.style = `
        position: fixed; inset: 0; z-index: 3000;
        background: rgba(249, 246, 240, 0.98);
        display: flex; align-items: center; justify-content: center;
        flex-direction: column; padding: 24px;
    `;

    if (!document.getElementById('mediaProcessStyle')) {
        const style = document.createElement('style');
        style.id = 'mediaProcessStyle';
        style.textContent = `
            @keyframes mediaIconBounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-6px); }
            }
            @keyframes mediaSpin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    overlay.innerHTML = `
        <div style="text-align:center;max-width:300px;width:100%;">
            <div style="
                width:72px;height:72px;margin:0 auto 20px;
                background:linear-gradient(135deg, var(--accent), #8fb382);
                border-radius:20px;
                display:flex;align-items:center;justify-content:center;
                animation:mediaIconBounce 1.5s ease-in-out infinite;
                box-shadow:0 4px 16px rgba(107,143,94,0.25);
            ">
                <span style="font-size:32px;line-height:1;">${escHTML(icon)}</span>
            </div>
            <h3 id="mediaProcessTitle" style="font-size:15px;font-weight:600;margin-bottom:8px;color:var(--text);">
                ${escHTML(title)}
            </h3>
            <p id="mediaProcessSubtitle" style="font-size:13px;color:var(--text-2);margin-bottom:20px;line-height:1.5;">
                ${escHTML(subtitle || '')}
            </p>
            <div style="
                width:32px;height:32px;margin:0 auto;
                border:3px solid var(--border);
                border-top:3px solid var(--accent);
                border-radius:50%;
                animation:mediaSpin 0.8s linear infinite;
            "></div>
            <p style="font-size:11px;color:var(--text-3);margin-top:16px;">
                Mohon tunggu, jangan tutup halaman.
            </p>
        </div>
    `;

    document.body.appendChild(overlay);
}

function updateMediaProcessing(title, subtitle) {
    const t = document.getElementById('mediaProcessTitle');
    const s = document.getElementById('mediaProcessSubtitle');
    if (t && title) t.textContent = title;
    if (s && subtitle) s.textContent = subtitle;
}

function hideMediaProcessing() {
    const overlay = document.getElementById('mediaProcessingOverlay');
    if (overlay) {
        overlay.style.transition = 'opacity 0.25s';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 250);
    }
}

function showProcessing(show, text = 'Mohon tunggu sebentar...') {
    const modal = document.getElementById('processingOverlay');
    if (!modal) return;
    if (show) {
        document.getElementById('processingText').textContent = text;
        modal.classList.add('active');
    } else {
        modal.classList.remove('active');
    }
}

// ==========================================
// UPLOAD PROGRESS OVERLAY
// ==========================================

function showUploadProgress(totalFiles) {
    let overlay = document.getElementById('uploadProgressOverlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'uploadProgressOverlay';
    overlay.style = `
        position: fixed; inset: 0; z-index: 3000;
        background: rgba(249, 246, 240, 0.97);
        display: flex; align-items: center; justify-content: center;
        flex-direction: column; padding: 24px;
    `;

    overlay.innerHTML = `
        <div style="text-align:center;max-width:340px;width:100%;">
            <div id="uploadIcon" style="
                width:64px;height:64px;margin:0 auto 20px;
                background:var(--accent);border-radius:16px;
                display:flex;align-items:center;justify-content:center;
                animation:uploadPulse 1.5s ease-in-out infinite;
            ">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
            </div>
            <h3 id="uploadTitle" style="font-size:16px;font-weight:600;margin-bottom:6px;color:var(--text);">
                Mengirim Tugas
            </h3>
            <p id="uploadStatus" style="font-size:13px;color:var(--text-2);margin-bottom:20px;">
                Mempersiapkan file...
            </p>
            <div style="
                width:100%;height:8px;background:var(--border);
                border-radius:4px;overflow:hidden;margin-bottom:10px;
            ">
                <div id="uploadProgressBar" style="
                    width:0%;height:100%;border-radius:4px;
                    background:linear-gradient(90deg, var(--accent), #8fb382);
                    transition:width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                "></div>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span id="uploadFileCount" style="font-size:11px;color:var(--text-3);font-weight:500;">0 / ${totalFiles} file</span>
                <span id="uploadPercent" style="font-size:11px;color:var(--text-3);font-weight:500;">0%</span>
            </div>
            <p id="uploadHint" style="font-size:11px;color:var(--text-3);margin-top:16px;">
                Jangan tutup halaman ini selama proses upload berlangsung.
            </p>
        </div>
    `;

    if (!document.getElementById('uploadPulseStyle')) {
        const style = document.createElement('style');
        style.id = 'uploadPulseStyle';
        style.textContent = `
            @keyframes uploadPulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.08); opacity: 0.85; }
            }
            @keyframes uploadSuccess {
                0% { transform: scale(1); }
                50% { transform: scale(1.15); }
                100% { transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
}

function updateUploadProgress(currentFile, totalFiles, fileName) {
    const bar = document.getElementById('uploadProgressBar');
    const count = document.getElementById('uploadFileCount');
    const percent = document.getElementById('uploadPercent');
    const status = document.getElementById('uploadStatus');
    if (!bar) return;

    const pct = Math.round((currentFile / totalFiles) * 100);
    bar.style.width = pct + '%';
    count.textContent = `${currentFile} / ${totalFiles} file`;
    percent.textContent = pct + '%';

    if (fileName) {
        const shortName = fileName.length > 30 ? fileName.substring(0, 27) + '...' : fileName;
        status.textContent = `Mengunggah: ${shortName}`;
    }
}

function showUploadSaving() {
    const status = document.getElementById('uploadStatus');
    const bar = document.getElementById('uploadProgressBar');
    const percent = document.getElementById('uploadPercent');
    if (status) status.textContent = 'Menyimpan data...';
    if (bar) bar.style.width = '95%';
    if (percent) percent.textContent = '95%';
}

function showUploadComplete() {
    const icon = document.getElementById('uploadIcon');
    const title = document.getElementById('uploadTitle');
    const status = document.getElementById('uploadStatus');
    const bar = document.getElementById('uploadProgressBar');
    const percent = document.getElementById('uploadPercent');
    const hint = document.getElementById('uploadHint');

    if (icon) {
        icon.style.background = 'var(--success)';
        icon.style.animation = 'uploadSuccess 0.5s ease';
        icon.innerHTML = `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
        `;
    }
    if (title) title.textContent = 'Tugas Terkirim!';
    if (status) status.textContent = 'Tugas Anda berhasil dikirim.';
    if (bar) bar.style.width = '100%';
    if (percent) percent.textContent = '100%';
    if (hint) hint.style.display = 'none';
}

function hideUploadProgress() {
    const overlay = document.getElementById('uploadProgressOverlay');
    if (overlay) overlay.remove();
}

// ==========================================
// CONFIRM DIALOG
// ==========================================

function showConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        if (!modal) { resolve(window.confirm(message)); return; }

        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        modal.classList.add('active');

        // Clone buttons to remove any previous event listeners
        const oldOk = document.getElementById('btnConfirmOk');
        const oldCancel = document.getElementById('btnConfirmCancel');
        const newOk = oldOk.cloneNode(true);
        const newCancel = oldCancel.cloneNode(true);
        oldOk.replaceWith(newOk);
        oldCancel.replaceWith(newCancel);

        const cleanup = () => { modal.classList.remove('active'); };

        newOk.onclick = () => { cleanup(); resolve(true); };
        newCancel.onclick = () => { cleanup(); resolve(false); };
    });
}

function showAlert(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '—';
    const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return date.toLocaleDateString('id-ID', options);
}

/** Hanya izinkan http(s) untuk link eksternal dari data server */
function safeExternalUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
    } catch {
        return null;
    }
    return null;
}

function filterSafeUrls(urls) {
    return (urls || []).map((u) => safeExternalUrl(u)).filter(Boolean);
}

function generateUniqueFileName(originalName) {
    const timestamp = new Date().getTime();
    const randomString = Math.random().toString(36).substring(2, 8);
    const cleanName = originalName.replace(/[^a-zA-Z0-9.]/g, '_');
    return `${timestamp}_${randomString}_${cleanName}`;
}

// NOTE: generateTaskCode() removed — kode tugas kini dibuat oleh Worker di server.

/**
 * Escape HTML special characters to prevent XSS when injecting into innerHTML.
 */
function escHTML(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ==========================================
// IN-BROWSER AUDIO RECORDER
// ==========================================

let _audioRecorder  = null;
let _audioStream    = null;
let _audioChunks    = [];
let _audioTimerInt  = null;
let _audioAnimFrame = null;
let _audioAnalyser  = null;
let _audioCtx       = null;
let _audioSeconds   = 0;
let _isRecording    = false;

/**
 * Replace the default file-input UI with a custom in-browser recorder.
 * Called from loadStudentTask() when submission_type === 'audio'.
 */
function setupInBrowserAudioRecorder() {
    const mediaLabel      = document.getElementById('mediaLabel');
    const mediaInput      = document.getElementById('mediaInput');
    const mediaCaptureBtn = document.getElementById('mediaCaptureBtn');
    const mediaHint       = document.getElementById('mediaHint');
    if (!mediaLabel) return;

    mediaLabel.textContent    = 'Rekam Audio';
    mediaInput.style.display  = 'none';
    mediaCaptureBtn.style.display = 'none';
    mediaHint.style.display   = 'none';

    // --- inject recorder card ---
    const ui = document.createElement('div');
    ui.id = 'inBrowserAudioRecorder';

    if (!document.getElementById('audioRecorderStyle')) {
        const style = document.createElement('style');
        style.id = 'audioRecorderStyle';
        style.textContent = `
            @keyframes recPulse {
                0%,100% { box-shadow: 0 0 0 0 rgba(192,57,43,0.35); }
                50%      { box-shadow: 0 0 0 12px rgba(192,57,43,0); }
            }
            #recorderBtn.recording {
                border-color: var(--error) !important;
                background: #fee2e2 !important;
                animation: recPulse 1.4s ease-in-out infinite;
            }
            #recorderBtn.recording #recorderDot {
                width: 18px !important;
                height: 18px !important;
                border-radius: 4px !important;
            }
        `;
        document.head.appendChild(style);
    }

    ui.innerHTML = `
        <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--bg);">

            <!-- Waveform canvas -->
            <div style="background:var(--surface);border-bottom:1px solid var(--border);padding:10px 14px;">
                <canvas id="audioWaveform" width="600" height="56"
                    style="width:100%;height:56px;display:block;border-radius:4px;"></canvas>
            </div>

            <!-- Controls -->
            <div style="padding:18px 16px;text-align:center;">
                <div id="recorderTimer"
                    style="font-family:'DM Mono',monospace;font-size:32px;font-weight:500;color:var(--text);letter-spacing:0.04em;margin-bottom:6px;">
                    0:00
                </div>
                <div id="recorderText"
                    style="font-size:13px;color:var(--text-3);margin-bottom:18px;">
                    Tekan tombol untuk mulai merekam
                </div>

                <button type="button" id="recorderBtn" onclick="toggleRecording()"
                    style="
                        width:76px;height:76px;border-radius:50%;
                        border:3px solid var(--border);background:var(--surface);
                        cursor:pointer;display:flex;align-items:center;
                        justify-content:center;margin:0 auto;
                        transition:border-color .2s, background .2s;
                    " title="Mulai / Berhenti">
                    <div id="recorderDot"
                        style="width:30px;height:30px;border-radius:50%;background:var(--error);transition:all .2s;">
                    </div>
                </button>

                <p style="font-size:11px;color:var(--text-3);margin-top:12px;">
                    Maks. rekaman: 10 menit
                </p>
            </div>

            <!-- Fallback: file upload (hidden by default, shown on error) -->
            <div id="audioFallback" style="display:none;padding:0 16px 16px;">
                <div style="border-top:1px solid var(--border);padding-top:14px;text-align:center;">
                    <p style="font-size:12px;color:var(--text-3);margin-bottom:8px;">
                        Atau unggah file audio:
                    </p>
                    <input type="file" id="audioFallbackInput"
                        accept="audio/*,.m4a,.mp3,.aac,.ogg,.wav,.flac,.webm"
                        onchange="handleAudioFallback(event)"
                        style="font-size:12px;width:100%;">
                </div>
            </div>
        </div>
    `;

    const previewContainer = document.getElementById('mediaPreviewContainer');
    previewContainer.parentNode.insertBefore(ui, previewContainer.nextSibling);

    // Draw idle flat-line so canvas isn't blank
    _drawFlatLine();
}

/* ── public toggle (called by onclick) ── */
async function toggleRecording() {
    if (_isRecording) {
        _stopRecording();
    } else {
        await _startRecording();
    }
}

/* ── start ── */
async function _startRecording() {
    // Check API availability
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        _showFallback('Browser Anda tidak mendukung perekaman langsung. Gunakan file upload di bawah.');
        return;
    }
    if (typeof MediaRecorder === 'undefined') {
        _showFallback('Browser Anda tidak mendukung MediaRecorder. Gunakan file upload di bawah.');
        return;
    }

    try {
        _audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 }
        });
    } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            showAlert('Izin mikrofon ditolak. Buka pengaturan browser → izinkan akses mikrofon, lalu muat ulang halaman.', 'error');
            _showFallback('Mikrofon tidak dapat diakses. Gunakan file upload sebagai alternatif.');
        } else {
            showAlert('Gagal mengakses mikrofon: ' + err.message, 'error');
        }
        return;
    }

    // Pick best supported MIME
    // iOS Safari 14.3+ hanya mendukung audio/mp4; Chrome/Firefox lebih suka webm+opus
    const mimeOrder = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
    ];
    let selectedMime = '';
    for (const m of mimeOrder) {
        if (MediaRecorder.isTypeSupported(m)) { selectedMime = m; break; }
    }

    _audioChunks  = [];
    _audioSeconds = 0;

    try {
        _audioRecorder = new MediaRecorder(
            _audioStream,
            selectedMime ? { mimeType: selectedMime } : {}
        );
    } catch (e) {
        showAlert('Gagal membuat MediaRecorder: ' + e.message, 'error');
        _audioStream.getTracks().forEach(t => t.stop());
        _audioStream = null;
        return;
    }

    _audioRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) _audioChunks.push(e.data);
    };

    _audioRecorder.onstop = () => {
        const mime = _audioRecorder.mimeType || selectedMime || 'audio/webm';
        const blob = new Blob(_audioChunks, { type: mime });

        let ext = 'webm';
        if (mime.includes('mp4') || mime.includes('m4a')) ext = 'm4a';
        else if (mime.includes('ogg'))                    ext = 'ogg';

        const stamp    = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const fileName = `rekaman_${stamp}.${ext}`;
        const file     = new File([blob], fileName, { type: mime });

        // Clean up stream
        if (_audioStream) { _audioStream.getTracks().forEach(t => t.stop()); _audioStream = null; }

        if (capturedMedia.length >= MAX_CAPTURED_MEDIA) {
            showAlert(`Maksimal ${MAX_CAPTURED_MEDIA} file per pengumpulan.`, 'error');
            _resetRecorderUI();
            return;
        }
        capturedMedia.push(file);
        renderMediaPreviews();

        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        showAlert(
            `Rekaman selesai! Durasi: ${_formatTime(_audioSeconds)} • Ukuran: ${sizeMB} MB`,
            'success'
        );

        _resetRecorderUI();
    };

    _audioRecorder.onerror = (e) => {
        showAlert('Error rekaman: ' + (e.error || e.message || 'Tidak diketahui'), 'error');
        _cleanupRecorder();
        _resetRecorderUI();
    };

    _audioRecorder.start(100);
    _isRecording = true;

    // Setup waveform visualiser
    try {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src      = _audioCtx.createMediaStreamSource(_audioStream);
        _audioAnalyser = _audioCtx.createAnalyser();
        _audioAnalyser.fftSize = 512;
        src.connect(_audioAnalyser);
        _drawWaveform();
    } catch (e) {
        console.warn('Waveform tidak tersedia:', e);
        _drawFlatLine();
    }

    // Update UI
    const btn  = document.getElementById('recorderBtn');
    const text = document.getElementById('recorderText');
    const timer= document.getElementById('recorderTimer');
    if (btn)   btn.classList.add('recording');
    if (text)  text.textContent = '⏺ Merekam… Tekan lagi untuk berhenti';
    if (timer) { timer.textContent = '0:00'; timer.style.color = 'var(--error)'; }

    // Tick timer every second; auto-stop at 10 min
    _audioTimerInt = setInterval(() => {
        _audioSeconds++;
        const el = document.getElementById('recorderTimer');
        if (el) el.textContent = _formatTime(_audioSeconds);
        if (_audioSeconds >= 600) _stopRecording();
    }, 1000);
}

/* ── stop ── */
function _stopRecording() {
    if (_audioRecorder && _audioRecorder.state === 'recording') {
        _audioRecorder.stop();
    }
    _cleanupRecorder();
    _isRecording = false;
}

function _cleanupRecorder() {
    if (_audioTimerInt)  { clearInterval(_audioTimerInt);          _audioTimerInt  = null; }
    if (_audioAnimFrame) { cancelAnimationFrame(_audioAnimFrame);  _audioAnimFrame = null; }
    if (_audioCtx)       { _audioCtx.close().catch(() => {});      _audioCtx       = null; }
    _audioAnalyser = null;
    _drawFlatLine();
}

function _resetRecorderUI() {
    const btn  = document.getElementById('recorderBtn');
    const text = document.getElementById('recorderText');
    const timer= document.getElementById('recorderTimer');
    if (btn)   btn.classList.remove('recording');
    if (text)  text.textContent = 'Rekaman tersimpan. Tekan lagi untuk rekam tambahan.';
    if (timer) { timer.textContent = '0:00'; timer.style.color = 'var(--text)'; }
}

function _showFallback(message) {
    const fb = document.getElementById('audioFallback');
    if (fb) fb.style.display = 'block';
    showAlert(message, 'error');
}

/* ── audio fallback (file upload when mic unavailable) ── */
async function handleAudioFallback(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    const validation = validateMediaFile(file, 'audio');
    if (!validation.ok) { showFormatError(validation.errorMsg, 'audio'); return; }

    if (capturedMedia.length >= MAX_CAPTURED_MEDIA) {
        showAlert(`Maksimal ${MAX_CAPTURED_MEDIA} file per pengumpulan.`, 'error');
        return;
    }

    const processed = normalizeAudioFile(file);
    capturedMedia.push(processed);
    renderMediaPreviews();
    showAlert('File audio berhasil ditambahkan!', 'success');
}

/* ── waveform drawing ── */
function _drawWaveform() {
    if (!_audioAnalyser) return;
    const canvas = document.getElementById('audioWaveform');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W   = canvas.width;
    const H   = canvas.height;
    const buf = new Uint8Array(_audioAnalyser.frequencyBinCount);

    const draw = () => {
        if (!_audioAnalyser) return;
        _audioAnimFrame = requestAnimationFrame(draw);
        _audioAnalyser.getByteTimeDomainData(buf);

        ctx.clearRect(0, 0, W, H);
        // background
        ctx.fillStyle = '#f9f6f0';
        ctx.fillRect(0, 0, W, H);
        // centre guide
        ctx.strokeStyle = '#e0d8c8';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
        // waveform
        ctx.lineWidth   = 2.5;
        ctx.strokeStyle = '#6b8f5e';
        ctx.lineJoin    = 'round';
        ctx.beginPath();
        const slice = W / buf.length;
        let x = 0;
        for (let i = 0; i < buf.length; i++) {
            const y = (buf[i] / 128.0) * (H / 2);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            x += slice;
        }
        ctx.lineTo(W, H / 2);
        ctx.stroke();
    };
    draw();
}

function _drawFlatLine() {
    const canvas = document.getElementById('audioWaveform');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f9f6f0';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#e0d8c8';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
}

function _formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ==========================================
// STORAGE MONITOR
// ==========================================

async function loadStorageUsage() {
    const bar = document.getElementById('storageBar');
    if (!bar) return;
    bar.style.display = 'block';

    try {
        const data = await apiRequest('/api/storage/usage');
        const totalBytes = data.used_bytes || 0;
        const STORAGE_LIMIT_MB = 10 * 1024; // 10 GB (Cloudflare R2 free tier)
        const usedMB = totalBytes / (1024 * 1024);
        const percent = Math.min((usedMB / STORAGE_LIMIT_MB) * 100, 100);

        let usedLabel;
        if (usedMB < 1) {
            usedLabel = `${(totalBytes / 1024).toFixed(0)} KB`;
        } else if (usedMB < 1024) {
            usedLabel = `${usedMB.toFixed(1)} MB`;
        } else {
            usedLabel = `${(usedMB / 1024).toFixed(2)} GB`;
        }

        document.getElementById('storageText').textContent = `${usedLabel} / 10 GB`;

        const fill = document.getElementById('storageFill');
        fill.style.width = `${percent}%`;
        fill.className = 'storage-fill' + (percent > 90 ? ' danger' : percent > 70 ? ' warning' : '');

        const warningEl = document.getElementById('storageWarning');
        if (warningEl) {
            if (percent > 90) {
                warningEl.style.display = 'block';
                warningEl.className = 'storage-warning danger';
                warningEl.innerHTML = '⚠️ <strong>Penyimpanan hampir penuh!</strong> Segera hapus tugas-tugas lama yang sudah tidak diperlukan. Buka detail tugas → klik tombol "Hapus" untuk menghapus tugas beserta seluruh file kiriman siswa.';
            } else if (percent > 70) {
                warningEl.style.display = 'block';
                warningEl.className = 'storage-warning';
                warningEl.innerHTML = '💡 Penyimpanan mulai terbatas. Pertimbangkan untuk menghapus tugas-tugas lama yang sudah selesai agar ruang penyimpanan tetap tersedia.';
            } else {
                warningEl.style.display = 'none';
            }
        }
    } catch (e) {
        document.getElementById('storageText').textContent = 'Gagal memuat';
        console.error('Storage usage error:', e);
    }
}

// ==========================================
// LAYOUT GURU — SIDEBAR
// ==========================================

const ADMIN_WHATSAPP_URL = 'https://wa.me/6281364254694';

const TEACHER_ROUTES = {
    tasks: { file: 'dashboard.html', path: 'dashboard.html', title: 'Daftar Tugas - Sistem Tugas' },
    classes: { file: 'kelas.html', path: 'kelas.html', title: 'Kelas - Sistem Tugas' },
};

let _teacherRoute = null;
let _teacherNavigateToken = 0;

function getTeacherPagePath() {
    return window.location.pathname.split('/').pop() || 'dashboard.html';
}

function isTeacherShellPage() {
    const path = getTeacherPagePath();
    return path === 'dashboard.html' || path === 'kelas.html';
}

function getTeacherRouteFromPath() {
    const path = getTeacherPagePath();
    if (path === 'kelas.html') return 'classes';
    return 'tasks';
}

function closeTeacherSidebarPanel() {
    document.getElementById('teacherSidebar')?.classList.remove('open');
    document.getElementById('sidebarBackdrop')?.classList.remove('visible');
}

function setTeacherSidebarActive(route) {
    document.querySelectorAll('#teacherSidebar [data-teacher-route]').forEach((a) => {
        a.classList.toggle('active', a.dataset.teacherRoute === route);
    });
}

/**
 * Mount sidebar on teacher pages. activePage: 'tasks' | 'classes'
 */
function mountTeacherSidebar(activePage) {
    if (!document.querySelector('.app-layout')) {
        const container = document.querySelector('.container');
        if (!container) return;

        const layout = document.createElement('div');
        layout.className = 'app-layout';

        const sidebar = document.createElement('aside');
        sidebar.className = 'sidebar';
        sidebar.id = 'teacherSidebar';
        sidebar.innerHTML = `
            <div class="sidebar-brand">
                <span class="sidebar-logo">🌿</span>
                <span class="sidebar-title">Sistem Tugas</span>
            </div>
            <nav class="sidebar-nav">
                <a href="dashboard.html" data-teacher-route="tasks" class="sidebar-link">Daftar Tugas</a>
                <a href="kelas.html" data-teacher-route="classes" class="sidebar-link">Kelas</a>
            </nav>
            <div class="sidebar-footer">
                <a href="${ADMIN_WHATSAPP_URL}" target="_blank" rel="noopener noreferrer" class="sidebar-link sidebar-contact">Hubungi Admin</a>
                <button type="button" class="sidebar-link sidebar-logout" onclick="logout()">Keluar</button>
            </div>
        `;

        const backdrop = document.createElement('div');
        backdrop.className = 'sidebar-backdrop';
        backdrop.id = 'sidebarBackdrop';

        const main = document.createElement('main');
        main.className = 'main-content';

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'sidebar-toggle';
        toggle.id = 'sidebarToggle';
        toggle.setAttribute('aria-label', 'Buka menu');
        toggle.textContent = '☰';

        const parent = container.parentNode;
        parent.insertBefore(layout, container);
        layout.appendChild(sidebar);
        layout.appendChild(backdrop);
        main.appendChild(toggle);
        main.appendChild(container);
        layout.appendChild(main);

        toggle.addEventListener('click', () => {
            const open = sidebar.classList.toggle('open');
            backdrop.classList.toggle('visible', open);
        });
        backdrop.addEventListener('click', closeTeacherSidebarPanel);

        if (!window.__teacherPopstateBound) {
            window.__teacherPopstateBound = true;
            window.addEventListener('popstate', (e) => {
                if (!isTeacherShellPage()) return;
                const route = e.state?.teacherRoute || getTeacherRouteFromPath();
                if (document.querySelector('.app-layout')) {
                    navigateTeacherPage(route, { pushState: false });
                }
            });
        }
    }

    setTeacherSidebarActive(activePage);

    const sidebar = document.getElementById('teacherSidebar');
    if (sidebar && !sidebar.dataset.navBound) {
        sidebar.dataset.navBound = '1';
        sidebar.querySelectorAll('[data-teacher-route]').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const route = a.dataset.teacherRoute;
                if (!route) return;
                if (isTeacherShellPage()) {
                    if (route !== _teacherRoute) navigateTeacherPage(route);
                } else {
                    window.location.href = TEACHER_ROUTES[route].path;
                }
                closeTeacherSidebarPanel();
            });
        });
    }

    if (isTeacherShellPage()) {
        _teacherRoute = activePage;
        const route = TEACHER_ROUTES[activePage];
        if (route) {
            history.replaceState({ teacherRoute: activePage }, '', route.path);
        }
    } else {
        _teacherRoute = null;
    }
}

async function navigateTeacherPage(route, options = {}) {
    const config = TEACHER_ROUTES[route];
    if (!config) return;
    if (isTeacherShellPage() && route === _teacherRoute && options.pushState !== false) return;

    const token = ++_teacherNavigateToken;
    const container = document.querySelector('.main-content .container') || document.querySelector('.container');
    if (!container) {
        window.location.href = config.path;
        return;
    }

    try {
        const res = await fetch(config.file);
        if (!res.ok) throw new Error('Gagal memuat halaman');
        const html = await res.text();
        if (token !== _teacherNavigateToken) return;

        const doc = new DOMParser().parseFromString(html, 'text/html');
        const newContainer = doc.querySelector('.container');
        if (!newContainer) throw new Error('Konten halaman tidak valid');

        const oldModals = Array.from(document.querySelectorAll('[data-teacher-page-modal]'));
        const newModalNodes = Array.from(doc.querySelectorAll('[data-teacher-page-modal]'))
            .map((el) => document.importNode(el, true));
        const prevContainerHtml = container.innerHTML;
        const prevRoute = _teacherRoute;
        const hadPushState = options.pushState !== false;

        container.innerHTML = newContainer.innerHTML;
        document.title = config.title;
        _teacherRoute = route;
        setTeacherSidebarActive(route);

        if (hadPushState) {
            history.pushState({ teacherRoute: route }, '', config.path);
        }

        try {
            if (route === 'tasks') await initDashboardPage();
            else if (route === 'classes') await initKelasPage();
            oldModals.forEach((el) => el.remove());
            newModalNodes.forEach((el) => document.body.appendChild(el));
        } catch (initErr) {
            container.innerHTML = prevContainerHtml;
            _teacherRoute = prevRoute;
            setTeacherSidebarActive(prevRoute);
            if (hadPushState) history.back();
            throw initErr;
        }
    } catch (e) {
        showAlert(e.message || 'Gagal memuat halaman.', 'error');
    }
}

/** Daftar nama siswa yang valid untuk tugas ber-target kelas (null = bebas) */
function setTaskClassStudentNames(names) {
    window.__taskClassStudentNames = names;
}

function setTaskClassRosterFailed(failed) {
    window.__taskClassRosterFailed = !!failed;
}

function isStudentNameInClassList(name) {
    if (window.__taskClassRosterFailed) return false;
    const allowed = window.__taskClassStudentNames;
    // null/undefined = tugas tanpa target kelas (input bebas)
    if (allowed === null || allowed === undefined) return true;
    if (!Array.isArray(allowed)) return true;
    if (allowed.length === 0) return false;
    const n = String(name || '').trim().toLowerCase();
    return allowed.some((s) => String(s).trim().toLowerCase() === n);
}

async function refreshStudentRosterIfNeeded() {
    if (window.__taskClassStudentNames === null || window.__taskClassStudentNames === undefined) {
        setTaskClassRosterFailed(false);
        return;
    }
    const classEl = document.getElementById('studentClass');
    if (!classEl || classEl.tagName !== 'SELECT') return;
    const option = classEl.options[classEl.selectedIndex];
    const classId = option?.dataset?.classId;
    if (!classId) {
        setTaskClassRosterFailed(true);
        return;
    }
    const taskCode = new URLSearchParams(window.location.search).get('code');
    if (!taskCode) {
        setTaskClassRosterFailed(true);
        return;
    }
    try {
        const resp = await fetch(`${API_BASE}/api/tasks/code/${taskCode}/classes/${classId}/students`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Gagal');
        const students = data.students || [];
        setTaskClassStudentNames(students.map((s) => s.name));
        setTaskClassRosterFailed(false);
    } catch {
        setTaskClassRosterFailed(true);
    }
}

function selectSubmissionType(btn) {
    document.querySelectorAll('.type-picker-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('taskSubmissionType').value = btn.dataset.type;
}

async function ensureDashboardScripts() {
    const scripts = [
        'https://cdn.jsdelivr.net/npm/flatpickr',
        'https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/id.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    ];
    for (const src of scripts) {
        if (document.querySelector(`script[src="${src}"]`)) continue;
        await new Promise((resolve, reject) => {
            const el = document.createElement('script');
            el.src = src;
            el.onload = resolve;
            el.onerror = () => reject(new Error('Gagal memuat dependensi halaman'));
            document.head.appendChild(el);
        });
    }
    const cssHref = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
    if (!document.querySelector(`link[href="${cssHref}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = cssHref;
        document.head.appendChild(link);
    }
}

async function initDashboardPage() {
    await ensureDashboardScripts();
    loadTasks();
    loadStorageUsage();
    loadDashboardClassCheckboxes();

    const deadlineEl = document.getElementById('taskDeadlineInput');
    if (deadlineEl && typeof flatpickr !== 'undefined') {
        if (deadlineEl._flatpickr) deadlineEl._flatpickr.destroy();
        flatpickr('#taskDeadlineInput', {
            enableTime: true,
            time_24hr: true,
            dateFormat: 'Y-m-d H:i',
            altInput: true,
            altFormat: 'j F Y, H:i',
            locale: 'id',
            minDate: 'today',
            disableMobile: false,
        });
    }

    const form = document.getElementById('createTaskForm');
    if (form && !form.dataset.bound) {
        form.dataset.bound = '1';
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleDashboardCreateTask();
        });
    }
}

async function handleDashboardCreateTask() {
    const title = document.getElementById('taskTitleInput').value.trim();
    const subject = document.getElementById('taskSubjectInput').value.trim();
    const deadline = document.getElementById('taskDeadlineInput').value;
    const desc = document.getElementById('taskDescInput').value;
    const fileInput = document.getElementById('taskFileInput');
    const file = fileInput.files.length > 0 ? fileInput.files[0] : null;
    const submissionType = document.getElementById('taskSubmissionType').value;
    if (!title || !subject || !deadline) {
        showAlert('Judul, mata pelajaran, dan deadline wajib diisi.', 'error');
        return;
    }
    const classIds = [];
    document.querySelectorAll('#classCheckboxes input[type="checkbox"]:checked').forEach((cb) => {
        classIds.push(cb.value);
    });
    await createTask(title, desc, subject, deadline, file, submissionType, classIds);
}

async function loadDashboardClassCheckboxes() {
    const container = document.getElementById('classCheckboxes');
    if (!container) return;
    try {
        const data = await apiRequest('/api/classes');
        if (!data.classes || data.classes.length === 0) {
            container.innerHTML = '<span style="font-size:13px; color:var(--text-3);">Belum ada kelas. <a href="kelas.html" id="linkBuatKelas">Buat kelas</a></span>';
            document.getElementById('linkBuatKelas')?.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTeacherPage('classes');
            });
            return;
        }
        container.innerHTML = data.classes.map(c => `
            <label style="display:flex; align-items:center; gap:8px; padding:6px 0; cursor:pointer; font-size:14px;">
                <input type="checkbox" value="${escHTML(c.id)}" style="accent-color:var(--accent);">
                ${escHTML(c.name)} <span style="font-size:12px; color:var(--text-3);">(${c.student_count} siswa)</span>
            </label>
        `).join('');
    } catch {
        container.innerHTML = '<span style="font-size:13px; color:var(--error);">Gagal memuat kelas.</span>';
    }
}

// ==========================================
// KELAS — halaman & modal
// ==========================================

async function initKelasPage() {
    const addBtn = document.getElementById('btnAddClass');
    if (addBtn && !addBtn.dataset.bound) {
        addBtn.dataset.bound = '1';
        addBtn.addEventListener('click', () => {
            resetClassForm();
            openModal('addClassModal');
        });
    }

    const classForm = document.getElementById('classForm');
    if (classForm && !classForm.dataset.bound) {
        classForm.dataset.bound = '1';
        classForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSaveClass();
        });
    }

    const editStudentForm = document.getElementById('editStudentForm');
    if (editStudentForm && !editStudentForm.dataset.bound) {
        editStudentForm.dataset.bound = '1';
        editStudentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleEditStudent();
        });
    }

    bindInlineClassNameEdit();

    const addModal = document.getElementById('addClassModal');
    if (addModal && !addModal.dataset.bound) {
        addModal.dataset.bound = '1';
        addModal.addEventListener('click', (e) => {
            if (e.target === addModal) {
                resetClassForm();
                closeModal('addClassModal');
            }
        });
    }

    await loadClasses();
}

async function loadClasses() {
    const container = document.getElementById('classList');
    if (!container) return;

    container.classList.add('task-list');
    container.innerHTML = '<div class="loader"></div>';

    try {
        const data = await apiRequest('/api/classes');
        const classes = data.classes || [];

        if (classes.length === 0) {
            container.innerHTML = '<p class="empty-state">Belum ada kelas. Klik "Tambah Kelas" untuk mulai.</p>';
            return;
        }

        container.innerHTML = '';
        classes.forEach((c) => {
            const el = document.createElement('div');
            el.className = 'task-item';
            const studentLabel = c.student_count === 1 ? '1 siswa' : `${c.student_count} siswa`;

            el.innerHTML = `
                <div class="task-info">
                    <h3>${escHTML(c.name)}</h3>
                    <p>${escHTML(studentLabel)}</p>
                </div>
                <div class="task-item-actions">
                    <button type="button" class="btn btn-outline btn-inline">Siswa</button>
                    <button type="button" class="btn btn-danger btn-inline">Hapus</button>
                </div>
            `;

            el.onclick = () => openStudents(c.id, c.name);

            const siswaBtn = el.querySelector('.btn-outline');
            siswaBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openStudents(c.id, c.name);
            });

            const deleteBtn = el.querySelector('.btn-danger');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleDeleteClass(c.id, c.name);
            });

            container.appendChild(el);
        });
    } catch (error) {
        container.innerHTML = `<p class="empty-state" style="color:var(--error);">Error: ${escHTML(error.message)}</p>`;
    }
}

function handleClassListAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const name = btn.dataset.name;
    if (action === 'students') openStudents(id, name);
    else if (action === 'delete-class') handleDeleteClass(id, name);
    else if (action === 'edit-student') openEditStudent(btn.dataset.id, btn.dataset.name);
    else if (action === 'delete-student') handleDeleteStudent(btn.dataset.id, btn.dataset.name);
}

function resetClassForm() {
    const title = document.getElementById('classModalTitle');
    if (title) title.textContent = 'Tambah Kelas';
    const nameInput = document.getElementById('classNameInput');
    if (nameInput) nameInput.value = '';
}

function showClassNameViewMode(name) {
    const display = document.getElementById('studentModalClassName');
    const input = document.getElementById('studentModalClassNameInput');
    const editBtn = document.getElementById('btnEditClassName');
    const editActions = document.getElementById('studentModalClassNameEditActions');
    if (!display || !input) return;

    display.textContent = name;
    display.style.display = '';
    input.style.display = 'none';
    input.value = name;
    if (editBtn) editBtn.style.display = '';
    if (editActions) editActions.style.display = 'none';
}

function startInlineClassNameEdit() {
    const name = document.getElementById('currentClassName')?.value || '';
    const display = document.getElementById('studentModalClassName');
    const input = document.getElementById('studentModalClassNameInput');
    const editBtn = document.getElementById('btnEditClassName');
    const editActions = document.getElementById('studentModalClassNameEditActions');
    if (!input) return;

    display.style.display = 'none';
    input.style.display = '';
    input.value = name;
    if (editBtn) editBtn.style.display = 'none';
    if (editActions) editActions.style.display = 'flex';
    input.focus();
    input.select();
}

function cancelInlineClassNameEdit() {
    const name = document.getElementById('currentClassName')?.value || '';
    showClassNameViewMode(name);
}

async function saveInlineClassNameEdit() {
    const classId = document.getElementById('currentClassId')?.value;
    const input = document.getElementById('studentModalClassNameInput');
    const name = input?.value.trim() || '';
    if (!classId) return;
    if (!name) {
        showAlert('Nama kelas wajib diisi.', 'error');
        input?.focus();
        return;
    }

    const saveBtn = document.getElementById('btnSaveClassName');
    const cancelBtn = document.getElementById('btnCancelClassName');
    if (saveBtn) saveBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    try {
        await apiRequest(`/api/classes/${classId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        document.getElementById('currentClassName').value = name;
        showClassNameViewMode(name);
        showAlert('Nama kelas berhasil diubah.');
        await loadClasses();
    } catch (e) {
        showAlert(e.message || 'Gagal mengubah nama kelas.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
    }
}

function bindInlineClassNameEdit() {
    const editBtn = document.getElementById('btnEditClassName');
    const saveBtn = document.getElementById('btnSaveClassName');
    const cancelBtn = document.getElementById('btnCancelClassName');
    const input = document.getElementById('studentModalClassNameInput');

    if (editBtn && !editBtn.dataset.bound) {
        editBtn.dataset.bound = '1';
        editBtn.addEventListener('click', startInlineClassNameEdit);
    }
    if (saveBtn && !saveBtn.dataset.bound) {
        saveBtn.dataset.bound = '1';
        saveBtn.addEventListener('click', saveInlineClassNameEdit);
    }
    if (cancelBtn && !cancelBtn.dataset.bound) {
        cancelBtn.dataset.bound = '1';
        cancelBtn.addEventListener('click', cancelInlineClassNameEdit);
    }
    if (input && !input.dataset.bound) {
        input.dataset.bound = '1';
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveInlineClassNameEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelInlineClassNameEdit();
            }
        });
    }
}

async function handleSaveClass() {
    const name = document.getElementById('classNameInput').value.trim();
    if (!name) {
        showAlert('Nama kelas wajib diisi.', 'error');
        return;
    }

    const btn = document.getElementById('btnSaveClass');
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';

    try {
        await apiRequest('/api/classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        showAlert('Kelas berhasil ditambahkan.');
        closeModal('addClassModal');
        await loadClasses();
    } catch (e) {
        showAlert(e.message || 'Gagal menyimpan kelas.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Simpan';
    }
}

async function handleDeleteClass(id, name) {
    const ok = await showConfirm('Hapus Kelas', `Hapus kelas "${name}"? Semua data siswa di kelas ini akan ikut terhapus.`);
    if (!ok) return;
    try {
        await apiRequest(`/api/classes/${id}`, { method: 'DELETE' });
        showAlert('Kelas berhasil dihapus.');
        await loadClasses();
    } catch (e) {
        showAlert(e.message || 'Gagal menghapus kelas.', 'error');
    }
}

async function openStudents(classId, className) {
    document.getElementById('currentClassId').value = classId;
    document.getElementById('currentClassName').value = className;
    showClassNameViewMode(className);
    document.getElementById('studentModalClassBlock').style.display = 'block';
    document.getElementById('bulkAddArea').style.display = 'none';
    openModal('studentModal');
    await loadStudents(classId);
}

async function loadStudents(classId) {
    const container = document.getElementById('studentList');
    container.innerHTML = '<div class="loader"></div>';
    try {
        const data = await apiRequest(`/api/classes/${classId}/students`);
        if (!data.students || data.students.length === 0) {
            container.innerHTML = '<p style="color:var(--text-3); text-align:center; font-size:13px;">Belum ada siswa. Klik "Tambah Siswa" untuk mulai.</p>';
            return;
        }
        container.innerHTML = '<div style="max-height: 400px; overflow-y: auto;">' +
            data.students.map((s, i) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; ${i > 0 ? 'border-top:1px solid var(--border);' : ''}">
                    <span>${escHTML(s.name)}</span>
                    <div style="display:flex; gap:4px;">
                        <button data-action="edit-student" data-id="${escHTML(s.id)}" data-name="${escHTML(s.name)}" class="btn btn-outline btn-inline btn-sm" style="padding:4px 10px; font-size:12px;">Edit</button>
                        <button data-action="delete-student" data-id="${escHTML(s.id)}" data-name="${escHTML(s.name)}" class="btn btn-danger btn-inline btn-sm" style="padding:4px 10px; font-size:12px;">Hapus</button>
                    </div>
                </div>
            `).join('') + '</div>';
        container.onclick = handleClassListAction;
    } catch {
        container.innerHTML = '<p style="color:var(--error); text-align:center;">Gagal memuat siswa.</p>';
    }
}

function openBulkAdd() {
    document.getElementById('bulkAddArea').style.display = 'block';
    document.getElementById('bulkNamesInput').value = '';
    document.getElementById('bulkNamesInput').focus();
}

function closeBulkAdd() {
    document.getElementById('bulkAddArea').style.display = 'none';
}

async function handleBulkAdd() {
    const classId = document.getElementById('currentClassId').value;
    const raw = document.getElementById('bulkNamesInput').value;
    const names = raw.split('\n').map((n) => n.trim()).filter((n) => n.length > 0);
    if (names.length === 0) {
        showAlert('Masukkan minimal 1 nama.', 'error');
        return;
    }

    const btn = document.getElementById('btnBulkAdd');
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';

    try {
        await apiRequest(`/api/classes/${classId}/students`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ names }),
        });
        showAlert(`${names.length} siswa berhasil ditambahkan.`);
        closeBulkAdd();
        await loadStudents(classId);
        await loadClasses();
    } catch (e) {
        showAlert(e.message || 'Gagal menambah siswa.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Simpan';
    }
}

function openEditStudent(id, name) {
    document.getElementById('editStudentId').value = id;
    document.getElementById('editStudentName').value = name;
    openModal('editStudentModal');
}

async function handleEditStudent() {
    const id = document.getElementById('editStudentId').value;
    const name = document.getElementById('editStudentName').value.trim();
    if (!name) {
        showAlert('Nama wajib diisi.', 'error');
        return;
    }

    const btn = document.getElementById('btnEditStudent');
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';

    try {
        await apiRequest(`/api/students/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        showAlert('Nama siswa berhasil diubah.');
        closeModal('editStudentModal');
        const classId = document.getElementById('currentClassId').value;
        await loadStudents(classId);
    } catch (e) {
        showAlert(e.message || 'Gagal mengubah nama.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Simpan';
    }
}

async function handleDeleteStudent(id, name) {
    const ok = await showConfirm('Hapus Siswa', `Hapus "${name}" dari daftar kelas?`);
    if (!ok) return;
    try {
        await apiRequest(`/api/students/${id}`, { method: 'DELETE' });
        showAlert('Siswa berhasil dihapus.');
        const classId = document.getElementById('currentClassId').value;
        await loadStudents(classId);
        await loadClasses();
    } catch (e) {
        showAlert(e.message || 'Gagal menghapus siswa.', 'error');
    }
}

// ==========================================
// AUTENTIKASI (LOGIN GURU)
// ==========================================

async function login(email, password) {
    const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setTeacherId(data.teacher_id);
    window.location.href = 'dashboard.html';
}

async function logout() {
    clearToken();
    window.location.href = 'index.html';
}

function isPublicLandingPage() {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    return path === 'index.html' || path === '' || path === 'index';
}

async function checkAuth(requireAuth = true) {
    const token = getToken();

    if (requireAuth && !token) {
        window.location.href = 'index.html';
        // Return special sentinel so callers can bail out
        return '__redirect__';
    }
    if (!requireAuth && token) {
        if (isPublicLandingPage()) {
            try {
                await apiRequest('/api/auth/check');
            } catch {
                clearToken();
            }
            return token;
        }
        try {
            await apiRequest('/api/auth/check');
            window.location.href = 'dashboard.html';
            return '__redirect__';
        } catch {
            clearToken();
            return null;
        }
    }
    if (token) {
        try {
            await apiRequest('/api/auth/check');
        } catch {
            clearToken();
            if (requireAuth) {
                window.location.href = 'index.html';
                return '__redirect__';
            }
            return null;
        }
    }
    return token;
}

// ==========================================
// GURU: MANAJEMEN TUGAS
// ==========================================

async function loadTasks() {
    const taskList = document.getElementById('taskList');
    if (!taskList) return;

    taskList.innerHTML = '<div class="loader"></div>';

    try {
        const data = await apiRequest('/api/tasks');
        const tasks = data.tasks || [];

        if (tasks.length === 0) {
            taskList.innerHTML = '<p class="empty-state">Belum ada tugas yang dibuat.</p>';
            return;
        }

        taskList.innerHTML = '';
        tasks.forEach(task => {
            const el = document.createElement('div');
            el.className = 'task-item';
            el.onclick = () => window.location.href = `detail.html?id=${task.id}`;

            el.innerHTML = `
                <div class="task-info">
                    <h3>${escHTML(task.title)}</h3>
                    <p>${escHTML(task.subject)} | Deadline: ${formatDate(task.deadline)}</p>
                </div>
                <div>
                    <button class="btn btn-outline btn-inline">Detail</button>
                </div>
            `;
            taskList.appendChild(el);
        });
    } catch (error) {
        taskList.innerHTML = `<p class="empty-state" style="color:var(--error);">Error: ${escHTML(error.message)}</p>`;
    }
}

async function handleDeleteAllTasks() {
    let tasks;
    try {
        const data = await apiRequest('/api/tasks');
        tasks = data.tasks || [];
    } catch (e) {
        showAlert('Gagal memuat tugas.', 'error');
        return;
    }

    if (tasks.length === 0) {
        showAlert('Tidak ada tugas untuk dihapus.', 'error');
        return;
    }

    const confirmed = await showConfirm('Hapus Semua Tugas', `Yakin ingin menghapus SEMUA ${tasks.length} tugas? Semua data pengumpulan dan file siswa akan terhapus secara permanen.`);
    if (!confirmed) return;

    showProcessing(true, 'Menghapus semua tugas dan file...');
    try {
        for (const task of tasks) {
            await apiRequest(`/api/tasks/${task.id}`, { method: 'DELETE' });
        }
        showAlert('Semua tugas berhasil dihapus!', 'success');
        loadTasks();
        loadStorageUsage();
    } catch (e) {
        showAlert('Gagal menghapus: ' + e.message, 'error');
    } finally {
        showProcessing(false);
    }
}

async function handleDownloadAllTasks() {
    let tasks;
    try {
        const data = await apiRequest('/api/tasks');
        tasks = (data.tasks || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } catch (e) {
        showAlert('Gagal memuat tugas: ' + e.message, 'error');
        return;
    }

    if (tasks.length === 0) {
        showAlert('Tidak ada tugas untuk diunduh.', 'error');
        return;
    }

    const confirmed = await showConfirm('Unduh Semua Tugas', `Semua kiriman dari ${tasks.length} tugas akan diunduh sebagai file ZIP. Proses ini mungkin memakan waktu. Lanjutkan?`);
    if (!confirmed) return;

    showProcessing(true, 'Menyiapkan file ZIP...');
    try {
        const zip = new JSZip();

        for (let ti = 0; ti < tasks.length; ti++) {
            const task = tasks[ti];
            showProcessing(true, `Memproses tugas ${ti + 1}/${tasks.length}: ${task.title}...`);

            const folderName = `${task.title} (${task.subject})`.replace(/[\\/:*?"<>|]/g, '_');
            const folder = zip.folder(folderName);

            let subs = [];
            try {
                const subData = await apiRequest(`/api/tasks/${task.id}/submissions`);
                subs = (subData.submissions || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            } catch (e) { continue; }

            if (subs.length === 0) continue;

            for (const sub of subs) {
                let urls = [];
                try { urls = JSON.parse(sub.file_url); } catch (e) { urls = [sub.file_url]; }

                const safeName = `${sub.student_name}_${sub.student_class}`.replace(/[\\/:*?"<>|]/g, '_');

                for (let fi = 0; fi < urls.length; fi++) {
                    try {
                        const response = await fetch(urls[fi], { mode: 'cors' });
                        if (!response.ok) continue;
                        const blob = await response.blob();

                        let ext = '';
                        const contentType = response.headers.get('content-type') || '';
                        if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
                        else if (contentType.includes('png')) ext = '.png';
                        else if (contentType.includes('webp')) ext = '.webp';
                        else if (contentType.includes('mp4')) ext = '.mp4';
                        else if (contentType.includes('webm')) ext = '.webm';
                        else if (contentType.includes('mpeg') || contentType.includes('mp3')) ext = '.mp3';
                        else if (contentType.includes('ogg')) ext = '.ogg';
                        else if (contentType.includes('wav')) ext = '.wav';
                        else {
                            const urlExt = urls[fi].split('.').pop().split('?')[0];
                            ext = urlExt ? '.' + urlExt : '';
                        }

                        const fileName = urls.length > 1 ? `${safeName}_${fi + 1}${ext}` : `${safeName}${ext}`;
                        folder.file(fileName, blob);
                    } catch (e) {
                        console.error(`Failed to download file for ${sub.student_name}:`, e);
                    }
                }
            }
        }

        showProcessing(true, 'Membuat file ZIP...');
        const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
            showProcessing(true, `Membuat ZIP... ${Math.round(metadata.percent)}%`);
        });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = `Semua_Tugas_${new Date().toISOString().slice(0, 10)}.zip`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 3000);
        showAlert('ZIP berhasil diunduh!', 'success');
    } catch (e) {
        showAlert('Gagal membuat ZIP: ' + e.message, 'error');
        console.error(e);
    } finally {
        showProcessing(false);
    }
}

async function createTask(title, description, subject, deadline, file, submissionType = 'image', classes = []) {
    const btnSubmit = document.getElementById('btnSubmitTask');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Menyimpan...';

    try {
        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description || '');
        formData.append('subject', subject);
        formData.append('deadline', deadline);
        formData.append('submission_type', submissionType);
        if (file) formData.append('file', file);
        if (classes.length > 0) formData.append('classes', JSON.stringify(classes));

        const data = await apiRequest('/api/tasks', {
            method: 'POST',
            body: formData,
            headers: {}, // Let browser set multipart boundary — do NOT set Content-Type manually
        });
        closeModal('createTaskModal');
        window.location.href = `detail.html?id=${data.task.id}`;
    } catch (error) {
        showAlert('Gagal membuat tugas: ' + error.message, 'error');
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Buat Tugas';
    }
}

// ==========================================
// GURU: DETAIL TUGAS & PENGUMPULAN
// ==========================================

async function loadTaskDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const taskId = urlParams.get('id');

    // Clear stale data from any previous call
    _downloadData.splice(0, _downloadData.length);

    if (!taskId) {
        window.location.href = 'dashboard.html';
        return;
    }

    try {
        const taskData = await apiRequest(`/api/tasks/${taskId}`);
        const task = taskData.task;

        const submissionType = task.submission_type || 'image';
        const typeBadges = { image: '📷 Gambar', video: '🎥 Video', audio: '🎙️ Audio' };

        document.getElementById('taskTitle').textContent = task.title;
        document.getElementById('taskSubject').textContent = task.subject;
        document.getElementById('taskDate').textContent = formatDate(task.created_at);
        document.getElementById('taskDeadline').textContent = formatDate(task.deadline);

        // Show description if available
        const descEl = document.getElementById('taskDescription');
        if (descEl) {
            if (task.description) {
                descEl.textContent = task.description;
                descEl.style.display = '';
            } else {
                descEl.style.display = 'none';
            }
        }

        const codeEl = document.getElementById('taskCode');
        if (codeEl) codeEl.textContent = task.task_code || '-';

        const badgeEl = document.getElementById('taskTypeBadge');
        if (badgeEl) badgeEl.textContent = typeBadges[submissionType] || typeBadges.image;

        const targetClassesEl = document.getElementById('taskTargetClasses');
        if (targetClassesEl) {
            if (task.classes && task.classes.length > 0) {
                targetClassesEl.innerHTML = task.classes.map(c =>
                    `<span class="type-badge">${escHTML(c.name)}</span>`
                ).join('');
            } else {
                targetClassesEl.innerHTML = '<span style="font-size:12px;color:var(--text-3);">Semua kelas (input bebas)</span>';
            }
        }

        const shareLink = new URL(`kumpul.html?code=${task.task_code}`, window.location.href).href;
        document.getElementById('shareLink').value = shareLink;

        const subData = await apiRequest(`/api/tasks/${taskId}/submissions`);
        const submissions = subData.submissions || [];

        const onTimeList = document.getElementById('onTimeList');
        const lateList = document.getElementById('lateList');

        onTimeList.innerHTML = '';
        lateList.innerHTML = '';

        let onTimeCount = 0;
        let lateCount = 0;

        const taskDeadlineTime = new Date(task.deadline).getTime();

        submissions.forEach(sub => {
            const submittedTime = new Date(sub.created_at).getTime();
            const isLate = submittedTime > taskDeadlineTime;

            let urls = [];
            try { urls = JSON.parse(sub.file_url); } catch (e) { urls = [sub.file_url]; }
            urls = filterSafeUrls(urls);
            if (urls.length === 0) return;

            const viewIndex = _downloadData.length;
            _downloadData.push({ urls: urls, name: sub.student_name, className: sub.student_class, type: submissionType });

            let btnHtml = `<button onclick="viewStudentSubmission(${viewIndex})" class="btn btn-outline btn-inline" style="margin:2px;font-size:12px;padding:5px 10px;">Lihat</button>`;
            btnHtml += `<button onclick="handleStudentDownload(${viewIndex})" class="btn btn-accent btn-inline" style="margin:2px;font-size:12px;padding:5px 10px;">Unduh</button>`;

            let noteHtml = '';
            if (sub.student_note) {
                noteHtml = `<div style="font-size:12px;color:var(--text-2);margin-top:4px;">${escHTML(sub.student_note)}</div>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escHTML(sub.student_name)}${noteHtml}</td>
                <td>${escHTML(sub.student_class)}</td>
                <td>${formatDate(sub.created_at)}</td>
                <td>${btnHtml}</td>
            `;

            if (isLate) {
                lateList.appendChild(tr);
                lateCount++;
            } else {
                onTimeList.appendChild(tr);
                onTimeCount++;
            }
        });

        if (onTimeCount === 0) onTimeList.innerHTML = '<tr><td colspan="4" class="text-center">Belum ada siswa yang mengumpulkan tepat waktu.</td></tr>';
        if (lateCount === 0) lateList.innerHTML = '<tr><td colspan="4" class="text-center">Tidak ada siswa yang terlambat.</td></tr>';

        const statTotal = document.getElementById('statTotal');
        const statOnTime = document.getElementById('statOnTime');
        const statLate = document.getElementById('statLate');
        if (statTotal) statTotal.textContent = onTimeCount + lateCount;
        if (statOnTime) statOnTime.textContent = onTimeCount;
        if (statLate) statLate.textContent = lateCount;

        document.getElementById('btnDeleteTask').onclick = async () => {
            const confirmed = await showConfirm('Hapus Tugas', 'Yakin ingin menghapus tugas ini? Semua data pengumpulan siswa juga akan ikut terhapus secara permanen.');
            if (confirmed) {
                showProcessing(true, 'Menghapus tugas dan file...');
                try {
                    await apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' });
                    window.location.href = 'dashboard.html';
                } catch (e) {
                    showAlert('Gagal menghapus: ' + e.message, 'error');
                    showProcessing(false);
                }
            }
        };

        document.getElementById('btnDownloadAll').onclick = async () => {
            if (submissions.length === 0) {
                showAlert("Belum ada pengumpulan tugas.", "error");
                return;
            }

            if (submissionType === 'image') {
                const confirmed = await showConfirm('Unduh Semua', 'Semua tugas siswa akan digabung menjadi satu file PDF. Lanjutkan?');
                if (!confirmed) return;
                showProcessing(true, 'Menggabungkan semua tugas...');
                try {
                    const allUrls = [];
                    for (let sub of submissions) {
                        let urls = [];
                        try { urls = JSON.parse(sub.file_url); } catch (e) { urls = [sub.file_url]; }
                        allUrls.push(...filterSafeUrls(urls));
                    }
                    if (allUrls.length === 0) throw new Error('Tidak ada file gambar yang valid.');
                    const pdfBlob = await createPDFBlob(allUrls);
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(pdfBlob);
                    link.download = `Semua_Tugas_${task.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
                    showAlert('PDF berhasil diunduh!', 'success');
                } catch (e) {
                    showAlert('Gagal membuat PDF: ' + e.message, 'error');
                    console.error(e);
                } finally {
                    showProcessing(false);
                }
            } else {
                // For audio/video: download each file individually
                const confirmed = await showConfirm('Unduh Semua', 'Semua file akan diunduh satu per satu. Lanjutkan?');
                if (!confirmed) return;
                showProcessing(true, 'Mengunduh semua file...');
                try {
                    for (let sub of submissions) {
                        let urls = [];
                        try { urls = JSON.parse(sub.file_url); } catch (e) { urls = [sub.file_url]; }
                        for (const url of filterSafeUrls(urls)) {
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = '';
                            a.target = '_blank';
                            a.rel = 'noopener noreferrer';
                            a.click();
                            await new Promise(r => setTimeout(r, 500));
                        }
                    }
                    showAlert('Semua file berhasil diunduh!', 'success');
                } catch (e) {
                    showAlert('Gagal mengunduh: ' + e.message, 'error');
                } finally {
                    showProcessing(false);
                }
            }
        };

        document.getElementById('btnViewAll').onclick = () => {
            if (submissions.length === 0) {
                showAlert("Belum ada pengumpulan tugas.", "error");
                return;
            }
            const allMedia = [];
            for (let sub of submissions) {
                let urls = [];
                try { urls = JSON.parse(sub.file_url); } catch (e) { urls = [sub.file_url]; }
                urls = filterSafeUrls(urls);
                if (urls.length === 0) continue;
                allMedia.push({ name: `${sub.student_name} — ${sub.student_class}`, urls: urls });
            }
            if (allMedia.length === 0) {
                showAlert('Tidak ada file pengumpulan yang valid.', 'error');
                return;
            }
            if (submissionType === 'image') {
                openImageViewer(allMedia);
            } else {
                openMediaViewer(allMedia, submissionType);
            }
        };

    } catch (error) {
        const rawMsg = error.message || 'Gagal memuat tugas';
        const titleEl = document.getElementById('taskTitle');
        if (titleEl) titleEl.textContent = 'Gagal memuat tugas';
        const subjectEl = document.getElementById('taskSubject');
        if (subjectEl) subjectEl.textContent = rawMsg;
        const onTimeList = document.getElementById('onTimeList');
        const lateList = document.getElementById('lateList');
        if (onTimeList) onTimeList.innerHTML = `<tr><td colspan="4" class="text-center" style="color:var(--error);">${escHTML(rawMsg)}</td></tr>`;
        if (lateList) lateList.innerHTML = `<tr><td colspan="4" class="text-center" style="color:var(--text-3);">—</td></tr>`;
        ['btnDeleteTask', 'btnDownloadAll', 'btnViewAll'].forEach((id) => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = true;
        });
        showAlert('Error memuat detail tugas: ' + (error.message || 'Gagal memuat'));
    }
}

// ==========================================
// SISWA: PENGUMPULAN TUGAS
// ==========================================

async function loadStudentTask() {
    if (!isMobileDevice()) {
        // Soft warning — still allow desktop access for testing/accessibility
        const banner = document.createElement('div');
        banner.style = 'background:#faf3e0;border:1px solid var(--accent-warm);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#7a5c20;';
        banner.innerHTML = '📱 <strong>Disarankan menggunakan HP</strong> agar dapat langsung mengambil foto/video/audio dari kamera.';
        document.getElementById('appContent').insertBefore(banner, document.getElementById('appContent').firstChild);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const taskCode = urlParams.get('code');
    const taskId = urlParams.get('id');

    if (!taskCode && !taskId) {
        document.getElementById('appContent').innerHTML = '<div class="card text-center"><h2>Tugas Tidak Ditemukan</h2><p>Link tidak valid atau tugas telah dihapus.</p></div>';
        return;
    }

    try {
        // Always use task code lookup (public, no auth required)
        // Access via ?id= is not supported for students (requires auth)
        if (!taskCode) {
            document.getElementById('appContent').innerHTML = '<div class="card text-center"><h2>Link Tidak Valid</h2><p>Gunakan link dengan kode tugas dari guru Anda (contoh: kumpul.html?code=123456).</p></div>';
            return;
        }

        const url = `${API_BASE}/api/tasks/code/${taskCode}`;
        const response = await fetch(url);
        let json;
        try {
            json = await response.json();
        } catch {
            throw new Error('Server mengembalikan respons tidak valid. Coba lagi nanti.');
        }
        if (!response.ok) throw new Error(json.error || 'Tugas tidak ditemukan');
        const task = json.task;

        currentTaskId = task.id;
        currentTaskCode = taskCode;

        document.getElementById('taskTitle').textContent = task.title;
        document.getElementById('taskSubject').textContent = task.subject;
        document.getElementById('taskDeadline').textContent = formatDate(task.deadline);

        // Show a late-submission warning if deadline has passed
        const deadlineTime = new Date(task.deadline).getTime();
        if (Date.now() > deadlineTime) {
            const lateWarning = document.createElement('div');
            lateWarning.style = 'background:#fee2e2;border:1px solid var(--error);border-radius:8px;padding:10px 14px;margin-top:10px;font-size:13px;color:#7f1d1d;';
            lateWarning.innerHTML = '⏰ <strong>Batas waktu pengumpulan telah lewat.</strong> Anda masih dapat mengirim tugas, namun akan tercatat sebagai <em>terlambat</em>.';
            document.querySelector('.card').appendChild(lateWarning);
        }

        if (task.description) {
            document.getElementById('taskDescription').textContent = task.description;
        } else {
            document.getElementById('taskDescription').style.display = 'none';
        }

        if (task.file_url) {
            const safeUrl = safeExternalUrl(task.file_url);
            if (safeUrl) {
                const link = document.createElement('a');
                link.href = safeUrl;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = 'Unduh File Soal';
                link.className = 'btn btn-outline btn-inline mt-1';
                document.getElementById('taskFileContainer').appendChild(link);
            }
        }

        // Configure media input based on submission type
        const subType = task.submission_type || 'image';
        currentSubmissionType = subType;

        const mediaInput = document.getElementById('mediaInput');
        const mediaLabel = document.getElementById('mediaLabel');
        const mediaCaptureBtn = document.getElementById('mediaCaptureBtn');
        const mediaHint = document.getElementById('mediaHint');

        if (subType === 'video') {
            mediaLabel.textContent = 'Video Tugas';
            // Accept all video formats including MOV (iOS), 3GP (Android)
            mediaInput.setAttribute('accept', 'video/*,.mov,.mp4,.webm,.3gp,.avi,.mkv');
            mediaInput.setAttribute('capture', 'environment');
            mediaCaptureBtn.textContent = 'Rekam Video';
            mediaHint.innerHTML = 'Tekan untuk merekam video. Format yang didukung: MP4, MOV, WebM, 3GP.<br><span style="color:var(--error)">Maksimal 100MB.</span>';
        } else if (subType === 'audio') {
            // In-browser recorder — no file picker needed
            setupInBrowserAudioRecorder();
        } else {
            mediaLabel.textContent = 'Foto Tugas';
            // Note: HEIC is listed but will be rejected with a friendly message
            mediaInput.setAttribute('accept', 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp');
            mediaInput.setAttribute('capture', 'environment');
            mediaCaptureBtn.textContent = 'Ambil Foto';
            mediaHint.innerHTML = 'Tekan untuk memfoto. Format yang didukung: JPG, PNG, WebP.<br><span style="color:var(--error)">Format HEIC (iPhone) tidak didukung — gunakan JPG.</span>';
        }

        // === Dynamic class dropdown + student name search-pick ===
        if (task.classes && task.classes.length > 0) {
            setTaskClassStudentNames([]);
            setTaskClassRosterFailed(false);
            const classField = document.getElementById('studentClass');
            const nameField = document.getElementById('studentName');

            const classSelect = document.createElement('select');
            classSelect.id = 'studentClass';
            classSelect.required = true;
            classSelect.style.width = '100%';
            classSelect.innerHTML = '<option value="" disabled selected>Pilih kelas...</option>' +
                task.classes.map(c => `<option value="${escHTML(c.name)}" data-class-id="${escHTML(c.id)}">${escHTML(c.name)}</option>`).join('');
            classField.replaceWith(classSelect);

            const nameContainer = document.createElement('div');
            nameContainer.id = 'studentNameContainer';
            nameContainer.innerHTML = `
                <input type="text" id="studentName" placeholder="Pilih kelas terlebih dahulu" autocomplete="off" disabled>
                <div id="studentNameDropdown" class="student-name-dropdown"></div>
            `;
            nameField.replaceWith(nameContainer);

            const searchInput = document.getElementById('studentName');
            const dropdown = document.getElementById('studentNameDropdown');
            let students = [];
            let debounceTimer;

            function unlockNameSearch() {
                searchInput.value = '';
                searchInput.removeAttribute('data-locked');
                searchInput.classList.remove('name-input-locked');
                searchInput.readOnly = false;
                searchInput.placeholder = students.length
                    ? 'Ketik nama untuk mencari...'
                    : 'Tidak ada siswa di kelas ini';
                dropdown.style.display = 'none';
            }

            function lockNameWithSelection(name) {
                searchInput.value = name;
                searchInput.dataset.locked = '1';
                searchInput.classList.add('name-input-locked');
                searchInput.readOnly = true;
                dropdown.style.display = 'none';
            }

            function runNameSearch() {
                if (searchInput.dataset.locked === '1') return;
                const q = searchInput.value.trim().toLowerCase();
                if (q.length < 1) {
                    dropdown.style.display = 'none';
                    return;
                }
                const matches = students.filter(s => s.name.toLowerCase().includes(q));
                if (matches.length === 0) {
                    dropdown.innerHTML = '<div style="padding:10px 12px; font-size:13px; color:var(--text-3);">Tidak ditemukan</div>';
                } else {
                    dropdown.innerHTML = matches.map(s =>
                        `<div class="student-pick-item" style="padding:10px 12px; cursor:pointer; font-size:14px; border-bottom:1px solid var(--border);">${escHTML(s.name)}</div>`
                    ).join('');
                }
                dropdown.style.display = 'block';
            }

            searchInput.addEventListener('input', function() {
                if (searchInput.dataset.locked === '1') return;
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(runNameSearch, 150);
            });

            searchInput.addEventListener('focus', function() {
                if (searchInput.dataset.locked === '1') {
                    unlockNameSearch();
                    return;
                }
                if (searchInput.value.trim().length >= 1) runNameSearch();
            });

            searchInput.addEventListener('click', function() {
                if (searchInput.dataset.locked === '1') unlockNameSearch();
            });

            dropdown.addEventListener('click', function(e) {
                const item = e.target.closest('.student-pick-item');
                if (!item) return;
                lockNameWithSelection(item.textContent.trim());
            });

            searchInput.addEventListener('blur', function() {
                setTimeout(() => { dropdown.style.display = 'none'; }, 200);
            });

            classSelect.addEventListener('change', async function() {
                const option = this.options[this.selectedIndex];
                const classId = option.dataset.classId;

                unlockNameSearch();
                searchInput.disabled = true;
                searchInput.placeholder = 'Memuat daftar siswa...';
                students = [];
                setTaskClassStudentNames([]);
                setTaskClassRosterFailed(false);

                if (!classId) {
                    searchInput.disabled = true;
                    searchInput.placeholder = 'Pilih kelas terlebih dahulu';
                    return;
                }

                try {
                    const resp = await fetch(`${API_BASE}/api/tasks/code/${taskCode}/classes/${classId}/students`);
                    const data = await resp.json();
                    if (!resp.ok) throw new Error(data.error || 'Gagal');
                    students = data.students || [];
                    setTaskClassStudentNames(students.map((s) => s.name));
                    setTaskClassRosterFailed(false);

                    searchInput.disabled = false;
                    if (students.length === 0) {
                        searchInput.placeholder = 'Tidak ada siswa di kelas ini';
                        searchInput.disabled = true;
                        return;
                    }

                    searchInput.placeholder = 'Ketik nama untuk mencari...';
                    searchInput.focus();
                } catch {
                    searchInput.placeholder = 'Gagal memuat siswa';
                    setTaskClassStudentNames([]);
                    setTaskClassRosterFailed(true);
                    searchInput.disabled = true;
                }
            });
        } else {
            setTaskClassStudentNames(null);
            setTaskClassRosterFailed(false);
        }

    } catch (error) {
        setTaskClassStudentNames(null);
        setTaskClassRosterFailed(false);
        document.getElementById('appContent').innerHTML = `<div class="card text-center"><h2>Gagal Memuat Tugas</h2><p style="color:var(--error);">${escHTML(error.message)}</p></div>`;
    }
}

async function submitTask(taskId, studentName, studentClass, files, studentNote, submissionType = 'image') {
    const submitBtn = document.getElementById('btnSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Mengirim...';

    try {
        const typeLabels = { image: 'foto', video: 'video', audio: 'audio' };
        if (!files || files.length === 0) throw new Error(`Harap ambil ${typeLabels[submissionType]} tugas.`);
        if (files.length > MAX_CAPTURED_MEDIA) {
            throw new Error(`Maksimal ${MAX_CAPTURED_MEDIA} file per pengumpulan.`);
        }

        // Show upload progress overlay
        showUploadProgress(files.length);

        // Build FormData — Worker handles upload to R2
        const formData = new FormData();
        if (!currentTaskCode) throw new Error('Kode tugas tidak ditemukan. Muat ulang halaman.');
        formData.append('task_code', currentTaskCode);
        formData.append('task_id', taskId);
        formData.append('student_name', studentName);
        formData.append('student_class', studentClass);
        if (studentNote && studentNote.trim()) formData.append('student_note', studentNote.trim());

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            formData.append(`file_${i}`, file);
        }

        // Show indeterminate uploading state — actual transfer happens in one fetch()
        updateUploadProgress(0, files.length, `Mengirim ${files.length} file...`);

        // Show "saving" state before sending
        showUploadSaving();

        const response = await fetch(`${API_BASE}/api/submissions`, {
            method: 'POST',
            body: formData,
        });

        let result = {};
        try {
            result = await response.json();
        } catch {
            throw new Error(`Server mengembalikan respons tidak valid (HTTP ${response.status}).`);
        }
        if (!response.ok) throw new Error(result.error || 'Gagal mengirim tugas');

        const fileUrls = result.file_urls || [];
        const replacedPrevious = !!result.replaced;

        // Show success state briefly
        showUploadComplete();
        await new Promise(r => setTimeout(r, 1200));

        // Build media gallery for success page
        let mediaGallery = '';
        if (submissionType === 'image') {
            mediaGallery = fileUrls.map((url, i) =>
                `<div style="text-align:center;cursor:pointer;" data-preview-url="${escHTML(url)}" data-preview-caption="Halaman ${i + 1} dari ${fileUrls.length}"><img src="${escHTML(url)}" style="width:100%;border-radius:4px;border:1px solid var(--border);"><div style="font-size:12px;color:var(--text-3);margin-top:4px;">Halaman ${i + 1}</div></div>`
            ).join('');
        } else if (submissionType === 'video') {
            mediaGallery = fileUrls.map((url, i) =>
                `<div style="margin-bottom:12px;"><video src="${escHTML(url)}" controls style="width:100%;border-radius:4px;border:1px solid var(--border);"></video><div style="font-size:12px;color:var(--text-3);margin-top:4px;text-align:center;">Video ${i + 1}</div></div>`
            ).join('');
        } else if (submissionType === 'audio') {
            mediaGallery = fileUrls.map((url, i) =>
                `<div style="margin-bottom:12px;padding:12px;background:var(--bg);border-radius:4px;border:1px solid var(--border);"><div style="font-size:12px;color:var(--text-3);margin-bottom:6px;">Audio ${i + 1}</div><audio src="${escHTML(url)}" controls style="width:100%;height:36px;"></audio></div>`
            ).join('');
        }

        const fileLabel = submissionType === 'image' ? 'Halaman' : (submissionType === 'video' ? 'Video' : 'Audio');

        const taskTitle = document.getElementById('taskTitle')?.textContent || '';
        const taskSubject = document.getElementById('taskSubject')?.textContent || '';

        hideUploadProgress();

        document.getElementById('appContent').innerHTML = `
            <div class="card">
                <h2 style="color: var(--success); margin-bottom: 4px;">Tugas Terkirim</h2>
                <p style="margin-bottom: 16px;">Tugas Anda telah berhasil dikirim ke guru.${replacedPrevious ? ' Pengumpulan sebelumnya telah diganti dengan yang baru.' : ''}</p>

                <div style="border-top:1px solid var(--border); padding-top:14px;">
                    <div style="font-size:12px;color:var(--text-3);margin-bottom:2px;">Tugas</div>
                    <div style="font-weight:600;margin-bottom:4px;">${escHTML(taskTitle)}</div>
                    <div style="font-size:13px;color:var(--text-2);margin-bottom:12px;">${escHTML(taskSubject)}</div>

                    <div style="display:flex;gap:8px;font-size:13px;color:var(--text-2);margin-bottom:12px;">
                        <span>Nama: <strong>${escHTML(studentName)}</strong></span>
                        <span>Kelas: <strong>${escHTML(studentClass)}</strong></span>
                    </div>
                    ${studentNote && studentNote.trim() ? `<div style="font-size:13px;color:var(--text-2);margin-bottom:12px;">Catatan: ${escHTML(studentNote.trim())}</div>` : ''}
                </div>

                <div style="border-top:1px solid var(--border); padding-top:14px;">
                    <div style="font-size:12px;color:var(--text-3);margin-bottom:8px;">${escHTML(fileLabel)} yang dikirim (${fileUrls.length})</div>
                    <div id="successGallery" style="${submissionType === 'image' ? 'display:grid;grid-template-columns:repeat(auto-fill, minmax(120px, 1fr));gap:8px;' : ''}">${mediaGallery}</div>
                </div>
            </div>
        `;

        // Attach image preview handlers safely (avoid inline onclick with URLs)
        if (submissionType === 'image') {
            document.querySelectorAll('#successGallery [data-preview-url]').forEach(el => {
                el.addEventListener('click', () => {
                    previewUrl(el.dataset.previewUrl, el.dataset.previewCaption);
                });
            });
        }

    } catch (error) {
        hideUploadProgress();
        showAlert('Gagal mengirim tugas: ' + error.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Kirim Tugas';
    }
}

// ==========================================
// MODAL LOGIC
// ==========================================
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

async function copyLink() {
    const linkInput = document.getElementById('shareLink');
    try {
        await navigator.clipboard.writeText(linkInput.value);
    } catch {
        linkInput.select();
        document.execCommand("copy");
    }
    showAlert("Link berhasil disalin!", "success");
}

async function urlToDataURL(url) {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`Gagal mengunduh file: ${response.status} ${response.statusText}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function createPDFBlob(urls) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    for (let i = 0; i < urls.length; i++) {
        const dataUrl = await urlToDataURL(urls[i]);

        const img = new Image();
        img.src = dataUrl;
        await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = () => rej(new Error(`Gagal memuat gambar ke-${i + 1} untuk PDF.`));
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        const imgRatio = img.width / img.height;
        const pageRatio = pageWidth / pageHeight;

        let renderWidth, renderHeight;
        if (imgRatio > pageRatio) {
            renderWidth = pageWidth;
            renderHeight = pageWidth / imgRatio;
        } else {
            renderHeight = pageHeight;
            renderWidth = pageHeight * imgRatio;
        }

        const x = (pageWidth - renderWidth) / 2;
        const y = (pageHeight - renderHeight) / 2;

        if (i > 0) doc.addPage();
        // Auto-detect format from data URL to handle PNG transparency correctly
        let imgFormat = 'JPEG';
        if (dataUrl.startsWith('data:image/png')) imgFormat = 'PNG';
        else if (dataUrl.startsWith('data:image/webp')) imgFormat = 'WEBP';
        doc.addImage(dataUrl, imgFormat, x, y, renderWidth, renderHeight);
    }

    return doc.output('blob');
}

async function handleStudentDownload(index) {
    const data = _downloadData[index];
    if (!data) return;
    const type = data.type || 'image';
    if (type === 'image') {
        downloadStudentFiles(data.urls, data.name);
    } else {
        for (const url of data.urls) {
            const safeUrl = safeExternalUrl(url);
            if (!safeUrl) continue;
            const a = document.createElement('a');
            a.href = safeUrl;
            a.download = '';
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.click();
            await new Promise(r => setTimeout(r, 500));
        }
        showAlert('File berhasil diunduh!', 'success');
    }
}

async function downloadStudentFiles(urls, studentName) {
    showProcessing(true, `Menyiapkan PDF untuk ${studentName}...`);
    try {
        const pdfBlob = await createPDFBlob(urls);

        const link = document.createElement('a');
        link.href = URL.createObjectURL(pdfBlob);
        link.download = `Tugas_${studentName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);

        showAlert('PDF berhasil diunduh!', 'success');
    } catch (e) {
        showAlert('Gagal membuat PDF: ' + e.message, 'error');
        console.error(e);
    } finally {
        showProcessing(false);
    }
}

function viewStudentSubmission(index) {
    const data = _downloadData[index];
    if (!data) return;
    const label = `${data.name}${data.className ? ' \u2014 ' + data.className : ''}`;
    const type = data.type || 'image';
    if (type === 'image') {
        openImageViewer([{ name: label, urls: data.urls }]);
    } else {
        openMediaViewer([{ name: label, urls: data.urls }], type);
    }
}

let _viewerPopHandler = null;

function detachViewerPopHandler() {
    if (_viewerPopHandler) {
        window.removeEventListener('popstate', _viewerPopHandler);
        _viewerPopHandler = null;
    }
}

function openImageViewer(groups) {
    detachViewerPopHandler();
    let overlay = document.getElementById('imageViewerOverlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'imageViewerOverlay';
    overlay.style = 'position:fixed;inset:0;background:var(--bg);z-index:2000;overflow-y:auto;';

    const header = document.createElement('div');
    header.style = 'position:sticky;top:0;background:var(--surface);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;justify-content:space-between;align-items:center;z-index:1;';

    const title = document.createElement('div');
    title.style = 'font-weight:600;font-size:14px;';
    title.textContent = groups.length === 1 ? groups[0].name : `Semua Tugas (${groups.length} siswa)`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Tutup';
    closeBtn.className = 'btn btn-outline btn-inline';
    closeBtn.style = 'font-size:12px;padding:6px 14px;';
    closeBtn.onclick = () => { history.back(); };

    header.appendChild(title);
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    const content = document.createElement('div');
    content.style = 'max-width:720px;margin:0 auto;padding:20px;';

    groups.forEach((group, gi) => {
        if (groups.length > 1) {
            const label = document.createElement('div');
            label.style = 'font-weight:600;font-size:13px;margin-bottom:8px;padding-top:' + (gi > 0 ? '24px' : '0') + ';border-top:' + (gi > 0 ? '1px solid var(--border)' : 'none') + ';margin-top:' + (gi > 0 ? '24px' : '0') + ';';
            label.textContent = group.name;
            content.appendChild(label);
        }

        group.urls.forEach((url, i) => {
            const wrap = document.createElement('div');
            wrap.style = 'margin-bottom:12px;';

            const img = document.createElement('img');
            img.src = url;
            img.style = 'width:100%;border-radius:8px;border:1px solid var(--border);display:block;';
            img.loading = 'lazy';

            const cap = document.createElement('div');
            cap.style = 'font-size:12px;color:var(--text-3);margin-top:4px;text-align:center;';
            cap.textContent = `Halaman ${i + 1} dari ${group.urls.length}`;

            wrap.appendChild(img);
            wrap.appendChild(cap);
            content.appendChild(wrap);
        });
    });

    overlay.appendChild(content);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    history.pushState({ viewer: true }, '');

    _viewerPopHandler = () => {
        const el = document.getElementById('imageViewerOverlay');
        if (el) {
            el.remove();
            document.body.style.overflow = '';
        }
        detachViewerPopHandler();
    };
    window.addEventListener('popstate', _viewerPopHandler);
}

function openMediaViewer(groups, type) {
    detachViewerPopHandler();
    let overlay = document.getElementById('imageViewerOverlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'imageViewerOverlay';
    overlay.style = 'position:fixed;inset:0;background:var(--bg);z-index:2000;overflow-y:auto;';

    const header = document.createElement('div');
    header.style = 'position:sticky;top:0;background:var(--surface);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;justify-content:space-between;align-items:center;z-index:1;';

    const title = document.createElement('div');
    title.style = 'font-weight:600;font-size:14px;';
    const typeLabel = type === 'video' ? 'Video' : 'Audio';
    title.textContent = groups.length === 1 ? groups[0].name : `Semua ${typeLabel} (${groups.length} siswa)`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Tutup';
    closeBtn.className = 'btn btn-outline btn-inline';
    closeBtn.style = 'font-size:12px;padding:6px 14px;';
    closeBtn.onclick = () => { history.back(); };

    header.appendChild(title);
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    const content = document.createElement('div');
    content.style = 'max-width:720px;margin:0 auto;padding:20px;';

    groups.forEach((group, gi) => {
        if (groups.length > 1) {
            const label = document.createElement('div');
            label.style = 'font-weight:600;font-size:13px;margin-bottom:8px;' + (gi > 0 ? 'padding-top:24px;border-top:1px solid var(--border);margin-top:24px;' : '');
            label.textContent = group.name;
            content.appendChild(label);
        }

        group.urls.forEach((url, i) => {
            const wrap = document.createElement('div');
            wrap.className = 'media-viewer-item';

            if (type === 'video') {
                const vid = document.createElement('video');
                vid.src = url;
                vid.controls = true;
                vid.preload = 'metadata';
                vid.style = 'width:100%;display:block;';
                wrap.appendChild(vid);
            } else {
                const audioWrap = document.createElement('div');
                audioWrap.style = 'padding:16px;';
                const audio = document.createElement('audio');
                audio.src = url;
                audio.controls = true;
                audio.style = 'width:100%;';
                audioWrap.appendChild(audio);
                wrap.appendChild(audioWrap);
            }

            const cap = document.createElement('div');
            cap.className = 'media-viewer-caption';
            cap.textContent = `${typeLabel} ${i + 1} dari ${group.urls.length}`;
            wrap.appendChild(cap);

            content.appendChild(wrap);
        });
    });

    overlay.appendChild(content);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    history.pushState({ viewer: true }, '');

    _viewerPopHandler = () => {
        const el = document.getElementById('imageViewerOverlay');
        if (el) {
            el.remove();
            document.body.style.overflow = '';
        }
        detachViewerPopHandler();
    };
    window.addEventListener('popstate', _viewerPopHandler);
}