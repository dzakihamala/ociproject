-- Unique constraint on task_code (defense-in-depth against duplicate codes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_code ON tasks (task_code);

-- Index for deduplication query (removeOtherStudentSubmissions)
CREATE INDEX IF NOT EXISTS idx_submissions_task_student ON submissions (task_id, student_name, student_class);

-- Index for teacher's task listing
CREATE INDEX IF NOT EXISTS idx_tasks_teacher ON tasks (teacher_id);

-- byte_size column to replace N+1 R2.head() in storage usage query
ALTER TABLE submissions ADD COLUMN byte_size INTEGER NOT NULL DEFAULT 0;
