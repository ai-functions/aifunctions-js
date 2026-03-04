/**
 * In-memory job store for long-running REST operations (content sync, index, optimize batch).
 * Job TTL enforced on read; no persistence.
 */

const JOB_TTL_MS = Number(process.env.JOB_TTL) || 24 * 60 * 60 * 1000; // 24h default

export type JobStatus = "pending" | "running" | "completed" | "failed";

export type Job = {
  id: string;
  status: JobStatus;
  progress?: number | string;
  result?: unknown;
  error?: string;
  logs: string[];
  createdAt: number;
  updatedAt: number;
};

const store = new Map<string, Job>();

function nanoid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function isExpired(job: Job): boolean {
  return Date.now() - job.updatedAt > JOB_TTL_MS;
}

export function createJob(): { id: string; job: Job } {
  const id = nanoid();
  const job: Job = {
    id,
    status: "pending",
    logs: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.set(id, job);
  return { id, job };
}

export function getJob(id: string): Job | null {
  const job = store.get(id) ?? null;
  if (job && isExpired(job)) {
    store.delete(id);
    return null;
  }
  return job;
}

export function updateJob(
  id: string,
  update: Partial<Pick<Job, "status" | "progress" | "result" | "error">>
): Job | null {
  const job = store.get(id);
  if (!job) return null;
  if (job.status === "completed" || job.status === "failed") return job;
  Object.assign(job, update, { updatedAt: Date.now() });
  return job;
}

export function appendJobLog(id: string, line: string): void {
  const job = store.get(id);
  if (job) {
    job.logs.push(line);
    job.updatedAt = Date.now();
  }
}

export function getJobLogs(id: string): string[] | null {
  const job = getJob(id);
  return job ? job.logs : null;
}
