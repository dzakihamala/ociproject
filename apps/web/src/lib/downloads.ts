import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { API_BASE, apiRequest, getToken } from '@/api/client';
import { extensionFromMimeType, type SubmissionMediaType } from '@/lib/media';
import type { Submission, Task } from '@/types';
import { parseFileUrls, safeExternalUrl } from '@/types';

export type MediaGroup = {
  name: string;
  className?: string;
  urls: string[];
};

export const ZIP_FOLDER_ON_TIME = 'Tepat Waktu';
export const ZIP_FOLDER_LATE = 'Terlambat';

export function submissionToMediaGroup(sub: Submission): MediaGroup | null {
  const urls = urlsFromSubmission(sub.file_url);
  if (!urls.length) return null;
  return {
    name: sub.student_name,
    className: sub.student_class,
    urls,
  };
}

/** Same URL resolution as legacy app.js (parse JSON array or single URL). */
export function urlsFromSubmission(fileUrl: string): string[] {
  const raw = parseFileUrls(fileUrl);
  return raw
    .filter((u) => {
      const safe = safeExternalUrl(u);
      return !!safe;
    })
    .map((u) => safeExternalUrl(u)!);
}

export function buildDownloadIndex(subs: Submission[]) {
  return subs
    .map((sub) => {
      const group = submissionToMediaGroup(sub);
      if (!group) return null;
      return { sub, group };
    })
    .filter((x): x is { sub: Submission; group: MediaGroup } => !!x);
}

function sanitizeName(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, '_');
}

function resolveFileExtension(
  contentType: string,
  url: string,
  submissionType?: SubmissionMediaType | string,
): string {
  const mime = (contentType || '').split(';')[0].trim().toLowerCase();
  const fromMime = extensionFromMimeType(mime);
  if (fromMime) return `.${fromMime}`;

  if (submissionType === 'audio') {
    return '.mp3';
  }

  if (submissionType === 'video') {
    if (mime.includes('webm')) return '.webm';
    if (mime.includes('mp4') || mime.includes('quicktime')) return '.mp4';
    if (mime.includes('3gpp')) return '.3gp';
  }

  const urlExt = url.split('.').pop()?.split('?')[0]?.toLowerCase();
  if (urlExt) {
    if (submissionType === 'audio') return '.mp3';
    return `.${urlExt}`;
  }
  return '';
}

async function urlToDataURL(url: string): Promise<string> {
  const { blob } = await fetchBlobFromUrl(url);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function fetchBlobFromUrl(
  url: string,
  submissionType?: SubmissionMediaType | string,
): Promise<{ blob: Blob; ext: string }> {
  const safe = safeExternalUrl(url);
  if (!safe) throw new Error('URL file tidak valid');

  const token = getToken();
  if (token) {
    const proxyUrl = `${API_BASE}/api/files/blob?url=${encodeURIComponent(safe)}`;
    const response = await fetch(proxyUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      let msg = `Gagal mengunduh file (${response.status})`;
      try {
        const err = await response.json();
        if (err.error) msg = err.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const blob = await response.blob();
    const ext = resolveFileExtension(response.headers.get('content-type') || '', safe, submissionType);
    return { blob, ext };
  }

  const response = await fetch(safe, { mode: 'cors' });
  if (!response.ok) throw new Error(`Gagal mengunduh file: ${response.status}`);
  const blob = await response.blob();
  const ext = resolveFileExtension(response.headers.get('content-type') || '', safe, submissionType);
  return { blob, ext };
}

export async function createPdfBlob(urls: string[]): Promise<Blob> {
  const doc = new jsPDF();
  for (let i = 0; i < urls.length; i++) {
    const dataUrl = await urlToDataURL(urls[i]);
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error(`Gagal memuat gambar ke-${i + 1}.`));
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const imgRatio = img.width / img.height;
    const pageRatio = pageWidth / pageHeight;
    let renderWidth: number;
    let renderHeight: number;
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
    let imgFormat: 'JPEG' | 'PNG' | 'WEBP' = 'JPEG';
    if (dataUrl.startsWith('data:image/png')) imgFormat = 'PNG';
    else if (dataUrl.startsWith('data:image/webp')) imgFormat = 'WEBP';
    doc.addImage(dataUrl, imgFormat, x, y, renderWidth, renderHeight);
  }
  return doc.output('blob');
}

export function triggerDownload(blob: Blob, filename: string) {
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
}

async function downloadUrlsAsFiles(
  urls: string[],
  baseName: string,
  submissionType?: SubmissionMediaType | string,
) {
  for (let i = 0; i < urls.length; i++) {
    const { blob, ext } = await fetchBlobFromUrl(urls[i], submissionType);
    const fileName = urls.length > 1 ? `${baseName}_${i + 1}${ext}` : `${baseName}${ext}`;
    triggerDownload(blob, fileName);
    if (i < urls.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

async function generateAndDownloadZip(
  zip: JSZip,
  filename: string,
  onProgress?: (msg: string) => void,
) {
  onProgress?.('Membuat file ZIP...');
  const zipBlob = await zip.generateAsync({ type: 'blob' }, (meta) => {
    onProgress?.(`Membuat ZIP... ${Math.round(meta.percent)}%`);
  });
  triggerDownload(zipBlob, filename);
}

async function appendSubmissionFiles(
  folder: JSZip,
  sub: Submission,
  submissionType: SubmissionMediaType | string,
): Promise<number> {
  const urls = urlsFromSubmission(sub.file_url);
  if (!urls.length) return 0;

  const safeName = sanitizeName(sub.student_name);
  let added = 0;

  for (let fi = 0; fi < urls.length; fi++) {
    try {
      const { blob, ext } = await fetchBlobFromUrl(urls[fi], submissionType);
      const fileName = urls.length > 1 ? `${safeName}_${fi + 1}${ext}` : `${safeName}${ext}`;
      folder.file(fileName, blob);
      added++;
    } catch (e) {
      console.error(`Failed to download file for ${sub.student_name}:`, e);
    }
  }
  return added;
}

/** ZIP: Kelas → Tepat Waktu / Terlambat → file per nama siswa */
async function addSubmissionsByClassAndTiming(
  parent: JSZip,
  subs: Submission[],
  deadlineMs: number,
  submissionType: SubmissionMediaType | string,
): Promise<number> {
  const byClass = new Map<string, Submission[]>();
  for (const sub of subs) {
    const className = sub.student_class.trim() || 'Tanpa Kelas';
    const list = byClass.get(className);
    if (list) list.push(sub);
    else byClass.set(className, [sub]);
  }

  let filesAdded = 0;
  const classNames = [...byClass.keys()].sort((a, b) => a.localeCompare(b, 'id'));

  for (const className of classNames) {
    const classFolder = parent.folder(sanitizeName(className));
    if (!classFolder) continue;

    for (const sub of byClass.get(className)!) {
      const isLate = new Date(sub.created_at).getTime() > deadlineMs;
      const timingFolder = classFolder.folder(isLate ? ZIP_FOLDER_LATE : ZIP_FOLDER_ON_TIME);
      if (!timingFolder) continue;
      filesAdded += await appendSubmissionFiles(timingFolder, sub, submissionType);
    }
  }

  return filesAdded;
}

export async function downloadStudentSubmission(
  group: MediaGroup,
  submissionType: string,
  onProgress?: (msg: string) => void,
) {
  const safeBase = sanitizeName(group.name);
  if (submissionType === 'image') {
    onProgress?.(`Menyiapkan PDF untuk ${group.name}...`);
    const pdfBlob = await createPdfBlob(group.urls);
    triggerDownload(pdfBlob, `Tugas_${safeBase}.pdf`);
    return;
  }
  onProgress?.(`Mengunduh file untuk ${group.name}...`);
  if (group.urls.length > 1) {
    const zip = new JSZip();
    const pseudoSub: Submission = {
      id: 'local',
      task_id: 'local',
      student_name: group.name,
      student_class: group.className || '',
      file_url: JSON.stringify(group.urls),
      created_at: new Date().toISOString(),
    };
    const added = await appendSubmissionFiles(zip, pseudoSub, submissionType);
    if (added === 0) throw new Error('Tidak ada file yang berhasil diunduh.');
    await generateAndDownloadZip(zip, `Tugas_${safeBase}.zip`, onProgress);
    return;
  }
  await downloadUrlsAsFiles(group.urls, `Tugas_${safeBase}`, submissionType);
}

export async function downloadAllSubmissionsForTask(
  task: Task,
  subs: Submission[],
  onProgress?: (msg: string) => void,
) {
  const type = (task.submission_type || 'image') as SubmissionMediaType;
  if (type === 'image') {
    const allUrls: string[] = [];
    for (const sub of subs) {
      allUrls.push(...urlsFromSubmission(sub.file_url));
    }
    if (!allUrls.length) throw new Error('Tidak ada file gambar yang valid.');
    onProgress?.('Menggabungkan semua tugas menjadi PDF...');
    const pdfBlob = await createPdfBlob(allUrls);
    const title = sanitizeName(task.title);
    triggerDownload(pdfBlob, `Semua_Tugas_${title}.pdf`);
    return;
  }

  onProgress?.('Mengumpulkan file ke ZIP...');
  const zip = new JSZip();
  const deadlineMs = new Date(task.deadline).getTime();
  const filesAdded = await addSubmissionsByClassAndTiming(zip, subs, deadlineMs, type);

  if (filesAdded === 0) {
    throw new Error('Tidak ada file pengumpulan yang bisa diunduh. Pastikan siswa sudah mengirim file.');
  }

  const title = sanitizeName(task.title);
  await generateAndDownloadZip(zip, `Semua_Tugas_${title}.zip`, onProgress);
}

export async function downloadAllTasksZip(onProgress?: (msg: string) => void) {
  const data = await apiRequest<{ tasks: Task[] }>('/api/tasks');
  const tasks = (data.tasks || []).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  if (!tasks.length) throw new Error('Tidak ada tugas untuk diunduh.');

  const zip = new JSZip();
  let filesAdded = 0;

  for (let ti = 0; ti < tasks.length; ti++) {
    const task = tasks[ti];
    onProgress?.(`Memproses tugas ${ti + 1}/${tasks.length}: ${task.title}...`);

    const folderName = sanitizeName(`${task.title} (${task.subject})`);
    const taskFolder = zip.folder(folderName);
    if (!taskFolder) continue;

    let subs: Submission[] = [];
    try {
      const subData = await apiRequest<{ submissions: Submission[] }>(
        `/api/tasks/${task.id}/submissions`,
      );
      subs = (subData.submissions || []).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    } catch {
      continue;
    }
    if (!subs.length) continue;

    const submissionType = (task.submission_type || 'image') as SubmissionMediaType;
    const deadlineMs = new Date(task.deadline).getTime();
    filesAdded += await addSubmissionsByClassAndTiming(taskFolder, subs, deadlineMs, submissionType);
  }

  if (filesAdded === 0) {
    throw new Error('Tidak ada file pengumpulan yang bisa diunduh. Pastikan siswa sudah mengirim file.');
  }

  await generateAndDownloadZip(
    zip,
    `Semua_Tugas_${new Date().toISOString().slice(0, 10)}.zip`,
    onProgress,
  );
}
