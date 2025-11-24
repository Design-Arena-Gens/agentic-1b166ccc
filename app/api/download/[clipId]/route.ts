import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const CLIPS_DIR = path.join(process.cwd(), 'clips');

export async function GET(
  request: NextRequest,
  { params }: { params: { clipId: string } }
) {
  try {
    const clipId = params.clipId;
    const clipPath = path.join(CLIPS_DIR, `${clipId}.mp4`);

    if (!fs.existsSync(clipPath)) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    const videoBuffer = fs.readFileSync(clipPath);

    return new NextResponse(videoBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${clipId}.mp4"`,
        'Content-Length': videoBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
