-- Track task attachment sizes so storage queries use SUM() instead of N R2.head() calls
ALTER TABLE tasks ADD COLUMN byte_size INTEGER NOT NULL DEFAULT 0;
