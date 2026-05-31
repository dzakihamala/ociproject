export type Env = {
  DB: D1Database;
  TASK_FILES: R2Bucket;
  SUBMISSION_FILES: R2Bucket;
  JWT_SECRET: string;
  SETUP_KEY: string;
  TASK_FILES_PUBLIC_URL: string;
  SUBMISSION_FILES_PUBLIC_URL: string;
};

export type JwtPayload = {
  sub: string;
  email: string;
  exp?: number;
};
