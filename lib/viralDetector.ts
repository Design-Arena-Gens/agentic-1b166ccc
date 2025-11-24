import OpenAI from 'openai';
import { TranscriptSegment, ViralMoment } from '@/types';
import { v4 as uuidv4 } from 'uuid';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
});

const VIRAL_KEYWORDS = [
  'shocking', 'crazy', 'insane', 'unbelievable', 'secret', 'revealed', 'truth',
  'amazing', 'incredible', 'must see', 'warning', 'exposed', 'never', 'always',
  'everyone', 'nobody', 'mistake', 'hack', 'trick', 'best', 'worst', 'first time',
  'story', 'happened', 'realized', 'discovered', 'finally', 'actually'
];

const EMOTION_KEYWORDS = {
  excitement: ['excited', 'amazing', 'incredible', 'wow', 'awesome', 'fantastic'],
  surprise: ['shocking', 'surprised', 'unexpected', 'suddenly', 'wait', 'what'],
  urgency: ['now', 'must', 'need', 'quick', 'important', 'immediately'],
  curiosity: ['why', 'how', 'what if', 'imagine', 'think about', 'ever wondered'],
  controversy: ['wrong', 'lie', 'truth', 'exposed', 'hidden', 'secret'],
};

export async function detectViralMoments(
  segments: TranscriptSegment[],
  minDuration: number = 10,
  maxDuration: number = 60
): Promise<ViralMoment[]> {
  const moments: ViralMoment[] = [];
  const fullText = segments.map(s => s.text).join(' ');

  // Sliding window approach
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const startTime = segments[i].start;
      const endTime = segments[j].end;
      const duration = endTime - startTime;

      if (duration < minDuration) continue;
      if (duration > maxDuration) break;

      const windowSegments = segments.slice(i, j + 1);
      const windowText = windowSegments.map(s => s.text).join(' ');

      const score = calculateViralScore(windowText, windowSegments);

      if (score > 0.5) {
        moments.push({
          id: uuidv4(),
          start: startTime,
          end: endTime,
          score,
          text: windowText,
          reason: generateReason(windowText, score),
          emotions: detectEmotions(windowText),
          keywords: extractKeywords(windowText),
        });
      }
    }
  }

  // Use AI to refine top moments
  const topMoments = moments
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  const refinedMoments = await refineWithAI(topMoments, fullText);

  return refinedMoments
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function calculateViralScore(text: string, segments: TranscriptSegment[]): number {
  let score = 0;
  const lowerText = text.toLowerCase();

  // Keyword matching
  const keywordMatches = VIRAL_KEYWORDS.filter(kw => lowerText.includes(kw)).length;
  score += keywordMatches * 0.1;

  // Emotion detection
  const emotionCount = Object.values(EMOTION_KEYWORDS).reduce((count, keywords) => {
    return count + keywords.filter(kw => lowerText.includes(kw)).length;
  }, 0);
  score += emotionCount * 0.08;

  // Question detection (engagement)
  const questionMarks = (text.match(/\?/g) || []).length;
  score += questionMarks * 0.15;

  // Exclamation detection (energy)
  const exclamations = (text.match(/!/g) || []).length;
  score += exclamations * 0.1;

  // Speaker intensity (short, punchy segments)
  const avgSegmentLength = segments.reduce((sum, s) => sum + s.text.length, 0) / segments.length;
  if (avgSegmentLength < 50) score += 0.2;

  // Sentence variety
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length >= 3 && sentences.length <= 8) score += 0.15;

  return Math.min(score, 1);
}

function detectEmotions(text: string): string[] {
  const lowerText = text.toLowerCase();
  const emotions: string[] = [];

  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    if (keywords.some(kw => lowerText.includes(kw))) {
      emotions.push(emotion);
    }
  }

  return emotions;
}

function extractKeywords(text: string): string[] {
  const lowerText = text.toLowerCase();
  return VIRAL_KEYWORDS.filter(kw => lowerText.includes(kw));
}

function generateReason(text: string, score: number): string {
  const reasons: string[] = [];

  if (text.includes('?')) reasons.push('Engaging question');
  if (text.includes('!')) reasons.push('High energy');
  if (extractKeywords(text).length > 0) reasons.push('Viral keywords');
  if (detectEmotions(text).length > 2) reasons.push('Emotional appeal');

  return reasons.join(', ') || 'Interesting content';
}

async function refineWithAI(moments: ViralMoment[], fullTranscript: string): Promise<ViralMoment[]> {
  try {
    const prompt = `You are an expert at identifying viral social media content. Analyze these potential video clips and rank them by viral potential (1-10).

Full transcript context:
${fullTranscript.slice(0, 2000)}...

Potential clips:
${moments.map((m, i) => `${i + 1}. [${m.start.toFixed(1)}s - ${m.end.toFixed(1)}s]: "${m.text}"`).join('\n')}

Return a JSON array with objects containing: clipNumber (1-based index), viralScore (1-10), and reason (brief explanation).`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    const rankings = result.clips || [];

    return moments.map((moment, index) => {
      const ranking = rankings.find((r: any) => r.clipNumber === index + 1);
      if (ranking) {
        return {
          ...moment,
          score: ranking.viralScore / 10,
          reason: ranking.reason || moment.reason,
        };
      }
      return moment;
    });
  } catch (error) {
    console.error('AI refinement error:', error);
    return moments;
  }
}
