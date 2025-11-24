import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import formidable from 'formidable';
import { Readable } from 'stream';
import {
  downloadYouTubeVideo,
  extractAudioFromVideo,
  ensureDirectoryExists,
  getVideoDuration
} from '@/lib/videoProcessor';
import { transcribeVideo, getYouTubeTranscript } from '@/lib/transcription';
import { detectViralMoments } from '@/lib/viralDetector';
import { jobs } from '@/lib/storage';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const TEMP_DIR = path.join(process.cwd(), 'temp');

ensureDirectoryExists(UPLOADS_DIR);
ensureDirectoryExists(TEMP_DIR);

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let source: 'youtube' | 'upload' | 'audio';
    let videoPath: string;
    let jobId = uuidv4();

    if (contentType.includes('application/json')) {
      // YouTube URL
      const body = await request.json();
      const { url } = body;

      if (!url) {
        return NextResponse.json({ error: 'URL is required' }, { status: 400 });
      }

      source = 'youtube';

      // Extract video ID
      const videoId = extractYouTubeId(url);
      if (!videoId) {
        return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
      }

      videoPath = path.join(UPLOADS_DIR, `${jobId}.mp4`);

      // Create job
      jobs.set(jobId, {
        id: jobId,
        status: 'processing',
        progress: 0,
        currentStep: 'Downloading video',
      });

      // Process async
      processYouTubeVideo(jobId, url, videoId, videoPath).catch(err => {
        console.error('YouTube processing error:', err);
        jobs.set(jobId, {
          id: jobId,
          status: 'failed',
          error: err.message,
        });
      });

    } else if (contentType.includes('multipart/form-data')) {
      // File upload
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return NextResponse.json({ error: 'File is required' }, { status: 400 });
      }

      const fileExtension = path.extname(file.name).toLowerCase();
      const isAudio = ['.mp3', '.wav', '.m4a', '.aac'].includes(fileExtension);
      source = isAudio ? 'audio' : 'upload';

      videoPath = path.join(UPLOADS_DIR, `${jobId}${fileExtension}`);

      // Save file
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      fs.writeFileSync(videoPath, buffer);

      // Create job
      jobs.set(jobId, {
        id: jobId,
        status: 'processing',
        progress: 0,
        currentStep: 'Processing file',
      });

      // Process async
      processUploadedFile(jobId, videoPath, source).catch(err => {
        console.error('File processing error:', err);
        jobs.set(jobId, {
          id: jobId,
          status: 'failed',
          error: err.message,
        });
      });

    } else {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
    }

    return NextResponse.json({
      jobId,
      message: 'Processing started'
    });

  } catch (error) {
    console.error('Ingest error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function processYouTubeVideo(jobId: string, url: string, videoId: string, videoPath: string) {
  try {
    // Try to get transcript first (faster)
    jobs.set(jobId, {
      ...jobs.get(jobId),
      progress: 10,
      currentStep: 'Fetching transcript',
    });

    let segments: any[] = [];
    let needsDownload = false;

    try {
      segments = await getYouTubeTranscript(videoId);
    } catch {
      needsDownload = true;
    }

    if (needsDownload) {
      jobs.set(jobId, {
        ...jobs.get(jobId),
        progress: 20,
        currentStep: 'Downloading video',
      });

      await downloadYouTubeVideo(url, videoPath);

      jobs.set(jobId, {
        ...jobs.get(jobId),
        progress: 40,
        currentStep: 'Transcribing audio',
      });

      const audioPath = path.join(TEMP_DIR, `${jobId}.wav`);
      await extractAudioFromVideo(videoPath, audioPath);
      segments = await transcribeVideo(audioPath);
      fs.unlinkSync(audioPath);
    } else {
      // Still download for processing
      jobs.set(jobId, {
        ...jobs.get(jobId),
        progress: 30,
        currentStep: 'Downloading video',
      });
      await downloadYouTubeVideo(url, videoPath);
    }

    jobs.set(jobId, {
      ...jobs.get(jobId),
      progress: 60,
      currentStep: 'Detecting viral moments',
    });

    const moments = await detectViralMoments(segments);

    const duration = await getVideoDuration(videoPath);

    jobs.set(jobId, {
      id: jobId,
      status: 'completed',
      progress: 100,
      currentStep: 'Complete',
      result: {
        videoPath,
        segments,
        moments,
        duration,
        source: 'youtube',
      },
    });

  } catch (error) {
    throw error;
  }
}

async function processUploadedFile(jobId: string, videoPath: string, source: 'upload' | 'audio') {
  try {
    jobs.set(jobId, {
      ...jobs.get(jobId),
      progress: 20,
      currentStep: 'Extracting audio',
    });

    const audioPath = path.join(TEMP_DIR, `${jobId}.wav`);

    if (source === 'audio') {
      // For audio files, convert to wav
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      await execAsync(`ffmpeg -i "${videoPath}" -ar 16000 -ac 1 "${audioPath}" -y`);
    } else {
      await extractAudioFromVideo(videoPath, audioPath);
    }

    jobs.set(jobId, {
      ...jobs.get(jobId),
      progress: 40,
      currentStep: 'Transcribing audio',
    });

    const segments = await transcribeVideo(audioPath);
    fs.unlinkSync(audioPath);

    jobs.set(jobId, {
      ...jobs.get(jobId),
      progress: 70,
      currentStep: 'Detecting viral moments',
    });

    const moments = await detectViralMoments(segments);

    let duration = 0;
    if (source === 'upload') {
      duration = await getVideoDuration(videoPath);
    }

    jobs.set(jobId, {
      id: jobId,
      status: 'completed',
      progress: 100,
      currentStep: 'Complete',
      result: {
        videoPath,
        segments,
        moments,
        duration,
        source,
      },
    });

  } catch (error) {
    throw error;
  }
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}
