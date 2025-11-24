import { NextRequest, NextResponse } from 'next/server';
import { clipJobs } from '@/lib/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const jobId = params.jobId;

  const job = clipJobs.get(jobId);

  if (!job) {
    return NextResponse.json({ error: 'Clip job not found' }, { status: 404 });
  }

  return NextResponse.json(job);
}
