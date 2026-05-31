import type { Submission } from '@/types';

export type RosterStudent = { id: string; name: string };
export type ClassRoster = { classId: string; className: string; students: RosterStudent[] };

export function submissionKey(name: string, className: string) {
  return `${name.trim().toLowerCase()}|${className.trim().toLowerCase()}`;
}

export function filterSubmissionsByClass(subs: Submission[], classId: string, classes: { id: string; name: string }[]) {
  if (classId === 'all') return subs;
  const cls = classes.find((c) => c.id === classId);
  if (!cls) return subs;
  const cn = cls.name.trim().toLowerCase();
  return subs.filter((s) => s.student_class.trim().toLowerCase() === cn);
}

export function splitSubmissions(subs: Submission[], deadlineMs: number) {
  const submitted: Submission[] = [];
  const late: Submission[] = [];
  for (const s of subs) {
    if (new Date(s.created_at).getTime() > deadlineMs) late.push(s);
    else submitted.push(s);
  }
  return { submitted, late };
}

export function computeNotSubmitted(
  roster: ClassRoster[],
  subs: Submission[],
  classFilter: string,
  taskClasses: { id: string; name: string }[],
) {
  const relevantRoster =
    classFilter === 'all' ? roster : roster.filter((r) => r.classId === classFilter);

  const keys = new Set<string>();
  const scopedSubs = filterSubmissionsByClass(subs, classFilter, taskClasses);
  for (const s of scopedSubs) {
    keys.add(submissionKey(s.student_name, s.student_class));
  }

  const missing: { name: string; className: string }[] = [];
  for (const r of relevantRoster) {
    for (const st of r.students) {
      const key = submissionKey(st.name, r.className);
      if (!keys.has(key)) {
        missing.push({ name: st.name, className: r.className });
      }
    }
  }

  missing.sort((a, b) => a.className.localeCompare(b.className, 'id') || a.name.localeCompare(b.name, 'id'));
  return missing;
}
