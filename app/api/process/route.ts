import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { jobs, clipJobs } from '@/lib/storage';
import {
  createClip,
  addCaptionsToVideo,
  addZoomPanEffect,
  generateThumbnail,
  ensureDirectoryExists
} from '@/lib/videoProcessor';

const CLIPS_DIR = path.join(process.cwd(), 'clips');
ensureDirectoryExists(CLIPS_DIR);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, momentIds, config } = body;

    if (!jobId || !momentIds || !Array.isArray(momentIds)) {
      return NextResponse.json(
        { error: 'jobId and momentIds array are required' },
        { status: 400 }
      );
    }

    const ingestJob = jobs.get(jobId);

    if (!ingestJob || ingestJob.status !== 'completed') {
      return NextResponse.json(
        { error: 'Invalid or incomplete job' },
        { status: 400 }
      );
    }

    const { videoPath, segments, moments } = ingestJob.result;

    const selectedMoments = moments.filter((m: any) => momentIds.includes(m.id));

    if (selectedMoments.length === 0) {
      return NextResponse.json({ error: 'No valid moments selected' }, { status: 400 });
    }

    const clipJobId = uuidv4();

    clipJobs.set(clipJobId, {
      id: clipJobId,
      status: 'processing',
      progress: 0,
      currentStep: 'Preparing clips',
      totalClips: selectedMoments.length,
      processedClips: 0,
    });

    // Process clips async
    processClips(clipJobId, videoPath, segments, selectedMoments, config || {}).catch(err => {
      console.error('Clip processing error:', err);
      clipJobs.set(clipJobId, {
        id: clipJobId,
        status: 'failed',
        error: err.message,
      });
    });

    return NextResponse.json({
      clipJobId,
      message: 'Clip processing started',
    });

  } catch (error) {
    console.error('Process error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function processClips(
  clipJobId: string,
  videoPath: string,
  segments: any[],
  moments: any[],
  config: any
) {
  const clips = [];

  for (let i = 0; i < moments.length; i++) {
    const moment = moments[i];

    try {
      clipJobs.set(clipJobId, {
        ...clipJobs.get(clipJobId),
        progress: Math.floor((i / moments.length) * 100),
        currentStep: `Processing clip ${i + 1}/${moments.length}`,
        processedClips: i,
      });

      const clipId = uuidv4();
      const format = config.format || '9:16';
      const addCaptions = config.addCaptions !== false;
      const addEmojis = config.addEmojis !== false;
      const addZoomPan = config.addZoomPan !== false;

      // Step 1: Extract base clip
      const baseClipPath = path.join(CLIPS_DIR, `${clipId}_base.mp4`);
      await createClip(videoPath, baseClipPath, moment.start, moment.end, format);

      // Step 2: Add captions
      let processedPath = baseClipPath;
      if (addCaptions) {
        const captionedPath = path.join(CLIPS_DIR, `${clipId}_captioned.mp4`);
        await addCaptionsToVideo(baseClipPath, captionedPath, segments, moment, addEmojis);
        fs.unlinkSync(baseClipPath);
        processedPath = captionedPath;
      }

      // Step 3: Add zoom/pan effect
      let finalPath = processedPath;
      if (addZoomPan) {
        const zoomPath = path.join(CLIPS_DIR, `${clipId}_final.mp4`);
        await addZoomPanEffect(processedPath, zoomPath);
        if (processedPath !== baseClipPath) {
          fs.unlinkSync(processedPath);
        }
        finalPath = zoomPath;
      }

      // Rename to final name
      const finalClipPath = path.join(CLIPS_DIR, `${clipId}.mp4`);
      if (finalPath !== finalClipPath) {
        fs.renameSync(finalPath, finalClipPath);
      }

      // Generate thumbnail
      const thumbnailPath = path.join(CLIPS_DIR, `${clipId}_thumb.jpg`);
      await generateThumbnail(finalClipPath, thumbnailPath, 1);

      clips.push({
        id: clipId,
        videoPath: finalClipPath,
        thumbnailPath,
        duration: moment.end - moment.start,
        moment,
        ready: true,
      });

    } catch (error) {
      console.error(`Error processing clip ${i + 1}:`, error);
      clips.push({
        id: uuidv4(),
        error: error instanceof Error ? error.message : 'Unknown error',
        moment,
        ready: false,
      });
    }
  }

  clipJobs.set(clipJobId, {
    id: clipJobId,
    status: 'completed',
    progress: 100,
    currentStep: 'Complete',
    processedClips: moments.length,
    totalClips: moments.length,
    result: clips,
  });
}
