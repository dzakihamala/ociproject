import '@testing-library/jest-dom/vitest';

// Mock browser APIs not available in jsdom
Object.defineProperty(window, 'matchMedia', {
  value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});

// Mock external dependencies
vi.mock('flatpickr', () => ({ default: () => ({ destroy: () => {} }) }));
vi.mock('flatpickr/dist/l10n/id.js', () => ({}));
vi.mock('flatpickr/dist/flatpickr.min.css', () => ({}));
vi.mock('jszip', () => ({}));
vi.mock('qrcode', () => ({}));
vi.mock('jspdf', () => ({}));
vi.mock('lamejs', () => ({}));
vi.mock('html2canvas', () => ({}));
vi.mock('@/lib/downloads', () => ({
  downloadAllTasksZip: vi.fn(),
  downloadAllSubmissionsForTask: vi.fn(),
  downloadStudentSubmission: vi.fn(),
  buildDownloadIndex: () => [],
}));
vi.mock('@/lib/media', () => ({
  formatTime: () => '0:00',
  MAX_CAPTURED_MEDIA: 10,
  validateMediaFile: () => true,
  FORMAT_TIPS: {},
}));
vi.mock('@/lib/submissionStats', () => ({
  computeNotSubmitted: () => [],
  filterSubmissionsByClass: (s: unknown[]) => s,
  splitSubmissions: (s: unknown[]) => ({ submitted: s, late: [] }),
}));
