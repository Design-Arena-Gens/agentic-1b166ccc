export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface VideoMetadata {
  id: string;
  title?: string;
  duration: number;
  source: 'youtube' | 'upload' | 'audio';
  url?: string;
  filePath?: string;
}

export interface ViralMoment {
  id: string;
  start: number;
  end: number;
  score: number;
  reason: string;
  text: string;
  emotions: string[];
  keywords: string[];
}

export interface ClipConfig {
  momentId: string;
  start: number;
  end: number;
  addCaptions: boolean;
  addEmojis: boolean;
  addZoomPan: boolean;
  format: '9:16' | '16:9' | '1:1';
}

export interface ProcessedClip {
  id: string;
  videoPath: string;
  thumbnailPath: string;
  duration: number;
  moment: ViralMoment;
  ready: boolean;
}

export interface JobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  result?: ProcessedClip[];
  error?: string;
}
