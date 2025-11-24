import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { ViralMoment, TranscriptSegment } from '@/types';

const execAsync = promisify(exec);

const EMOJI_MAP: { [key: string]: string[] } = {
  excitement: ['🔥', '⚡', '💥', '🚀', '✨'],
  surprise: ['😱', '🤯', '😮', '👀', '‼️'],
  urgency: ['⏰', '🚨', '❗', '⚠️', '🔴'],
  curiosity: ['🤔', '💭', '🧐', '❓', '🔍'],
  controversy: ['💣', '🎯', '⛔', '🚫', '🔥'],
  positive: ['😊', '❤️', '👍', '💯', '🎉'],
  negative: ['😢', '😤', '💔', '👎', '⚠️'],
};

export async function extractAudioFromVideo(videoPath: string, outputPath: string): Promise<void> {
  const command = `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${outputPath}" -y`;
  await execAsync(command);
}

export async function createClip(
  videoPath: string,
  outputPath: string,
  startTime: number,
  endTime: number,
  format: '9:16' | '16:9' | '1:1' = '9:16'
): Promise<void> {
  const duration = endTime - startTime;

  let cropFilter = '';
  if (format === '9:16') {
    // Vertical format: 1080x1920
    cropFilter = 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1080:1920,scale=1080:1920';
  } else if (format === '1:1') {
    // Square format: 1080x1080
    cropFilter = 'scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080';
  } else {
    // Horizontal format: 1920x1080
    cropFilter = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
  }

  const command = `ffmpeg -ss ${startTime} -i "${videoPath}" -t ${duration} -vf "${cropFilter}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${outputPath}" -y`;

  await execAsync(command);
}

export async function addCaptionsToVideo(
  videoPath: string,
  outputPath: string,
  segments: TranscriptSegment[],
  moment: ViralMoment,
  addEmojis: boolean = true
): Promise<void> {
  // Generate SRT subtitle file
  const srtPath = videoPath.replace('.mp4', '.srt');
  const srtContent = generateSRT(segments, moment, addEmojis);
  fs.writeFileSync(srtPath, srtContent);

  // Apply subtitles with styling
  const subtitleStyle = `force_style='FontName=Arial,FontSize=24,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,MarginV=40,Alignment=2'`;

  const command = `ffmpeg -i "${videoPath}" -vf "subtitles=${srtPath}:${subtitleStyle}" -c:v libx264 -preset fast -crf 23 -c:a copy "${outputPath}" -y`;

  await execAsync(command);

  // Clean up SRT file
  fs.unlinkSync(srtPath);
}

function generateSRT(segments: TranscriptSegment[], moment: ViralMoment, addEmojis: boolean): string {
  const relevantSegments = segments.filter(s => s.start >= moment.start && s.end <= moment.end);

  let srtContent = '';
  relevantSegments.forEach((segment, index) => {
    const startTime = formatSRTTime(segment.start - moment.start);
    const endTime = formatSRTTime(segment.end - moment.start);

    let text = segment.text.trim();

    // Add emojis based on content
    if (addEmojis) {
      const emoji = selectEmoji(text, moment.emotions);
      if (emoji && Math.random() > 0.5) {
        text = `${emoji} ${text}`;
      }
    }

    srtContent += `${index + 1}\n`;
    srtContent += `${startTime} --> ${endTime}\n`;
    srtContent += `${text}\n\n`;
  });

  return srtContent;
}

function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function selectEmoji(text: string, emotions: string[]): string {
  const lowerText = text.toLowerCase();

  // Check emotions first
  for (const emotion of emotions) {
    if (EMOJI_MAP[emotion]) {
      const emojis = EMOJI_MAP[emotion];
      return emojis[Math.floor(Math.random() * emojis.length)];
    }
  }

  // Fallback keyword matching
  if (lowerText.includes('!')) return '‼️';
  if (lowerText.includes('?')) return '🤔';
  if (lowerText.includes('love') || lowerText.includes('great')) return '❤️';
  if (lowerText.includes('bad') || lowerText.includes('hate')) return '😤';

  return '';
}

export async function addZoomPanEffect(
  videoPath: string,
  outputPath: string,
  intensity: number = 0.05
): Promise<void> {
  // Ken Burns effect (zoom + pan)
  const zoomFilter = `zoompan=z='min(zoom+${intensity},1.5)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920`;

  const command = `ffmpeg -i "${videoPath}" -vf "${zoomFilter}" -c:v libx264 -preset fast -crf 23 -c:a copy "${outputPath}" -y`;

  try {
    await execAsync(command);
  } catch (error) {
    // If zoom/pan fails, just copy the file
    console.warn('Zoom/pan effect failed, using original video');
    fs.copyFileSync(videoPath, outputPath);
  }
}

export async function generateThumbnail(videoPath: string, outputPath: string, timeOffset: number = 1): Promise<void> {
  const command = `ffmpeg -ss ${timeOffset} -i "${videoPath}" -vframes 1 -vf "scale=320:-1" "${outputPath}" -y`;
  await execAsync(command);
}

export async function downloadYouTubeVideo(url: string, outputPath: string): Promise<void> {
  const ytdl = await import('ytdl-core');
  const videoInfo = await ytdl.getInfo(url);
  const format = ytdl.chooseFormat(videoInfo.formats, { quality: 'highest' });

  return new Promise((resolve, reject) => {
    const stream = ytdl.downloadFromInfo(videoInfo, { format });
    const writeStream = fs.createWriteStream(outputPath);

    stream.pipe(writeStream);

    writeStream.on('finish', () => resolve());
    writeStream.on('error', (error) => reject(error));
    stream.on('error', (error) => reject(error));
  });
}

export async function getVideoDuration(videoPath: string): Promise<number> {
  const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
  const { stdout } = await execAsync(command);
  return parseFloat(stdout.trim());
}

export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
