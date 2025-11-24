import OpenAI from 'openai';
import { TranscriptSegment } from '@/types';
import fs from 'fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
});

export async function transcribeVideo(audioPath: string): Promise<TranscriptSegment[]> {
  try {
    const audioFile = fs.createReadStream(audioPath);

    const response = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    const segments: TranscriptSegment[] = [];

    if (response.segments) {
      for (const segment of response.segments) {
        segments.push({
          text: segment.text,
          start: segment.start,
          end: segment.end,
          confidence: segment.avg_logprob ? Math.exp(segment.avg_logprob) : undefined,
        });
      }
    } else {
      // Fallback if no segments
      segments.push({
        text: response.text,
        start: 0,
        end: 0,
      });
    }

    return segments;
  } catch (error) {
    console.error('Transcription error:', error);
    throw new Error(`Failed to transcribe: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getYouTubeTranscript(videoId: string): Promise<TranscriptSegment[]> {
  try {
    const { YoutubeTranscript } = await import('youtube-transcript');
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

    return transcript.map((item: any) => ({
      text: item.text,
      start: item.offset / 1000,
      end: (item.offset + item.duration) / 1000,
    }));
  } catch (error) {
    console.error('YouTube transcript error:', error);
    throw new Error('Failed to fetch YouTube transcript');
  }
}
