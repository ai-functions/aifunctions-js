/**
 * In-memory job store for long-running REST operations (content sync, index, optimize batch).
 * Job TTL enforced on read; no persistence.
 * JOB_TTL env in seconds (default 3600 per API contract).
 */

const JOB_TTL_SEC = Number(process.env.JOB_TTL) || 3600;
const JOB_TTL_MS = JOB_TTL_SEC * 1000;

export type JobStatus = "pending" | "running" | "completed" | "failed";

export type JobType =
  | "generate-instructions"
  | "batch"
  | "race"
  | "content-sync"
  | "content-index"
  | "unknown";

export type Job = {
  id: string;
  type?: JobType;
  status: JobStatus;
  progress?: number;
  result?: unknown;
  error?: string;
  errorCode?: string;
  logs: string[];
  createdAt: number;
  updatedAt: number;
  currentStep?: string;
  totalSkills?: number;
  totalRuns?: number;
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

export function createJob(type?: JobType, meta?: { totalSkills?: number; totalRuns?: number }): { id: string; job: Job } {
  const id = nanoid();
  const job: Job = {
    id,
    type: type ?? "unknown",
    status: "pending",
    logs: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...(meta && { totalSkills: meta.totalSkills, totalRuns: meta.totalRuns }),
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

export function listJobs(options?: {
  status?: "running" | "completed" | "failed";
  limit?: number;
  offset?: number;
}): { jobs: Job[]; total: number } {
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const offset = Math.max(options?.offset ?? 0, 0);
  const statusFilter = options?.status;
  let jobs = Array.from(store.values()).filter((j) => !isExpired(j));
  if (statusFilter) jobs = jobs.filter((j) => j.status === statusFilter);
  jobs.sort((a, b) => b.updatedAt - a.updatedAt);
  const total = jobs.length;
  jobs = jobs.slice(offset, offset + limit);
  return { jobs, total };
}

export function updateJob(
  id: string,
  update: Partial<Pick<Job, "status" | "progress" | "result" | "error" | "errorCode" | "currentStep">>
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
