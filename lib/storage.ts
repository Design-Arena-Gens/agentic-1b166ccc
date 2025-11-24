// In-memory job storage (use Redis or database in production)
export const jobs = new Map<string, any>();
export const clipJobs = new Map<string, any>();
