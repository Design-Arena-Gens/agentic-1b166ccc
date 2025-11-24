'use client';

import { useState } from 'react';
import axios from 'axios';

interface ViralMoment {
  id: string;
  start: number;
  end: number;
  score: number;
  reason: string;
  text: string;
  emotions: string[];
  keywords: string[];
}

interface ProcessedClip {
  id: string;
  videoPath: string;
  thumbnailPath: string;
  duration: number;
  moment: ViralMoment;
  ready: boolean;
}

export default function Home() {
  const [inputType, setInputType] = useState<'youtube' | 'file'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [moments, setMoments] = useState<ViralMoment[]>([]);
  const [selectedMoments, setSelectedMoments] = useState<string[]>([]);
  const [processingClips, setProcessingClips] = useState(false);
  const [clipJobId, setClipJobId] = useState<string | null>(null);
  const [clips, setClips] = useState<ProcessedClip[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setJobId(null);
    setStatus(null);
    setMoments([]);
    setSelectedMoments([]);
    setClips([]);

    try {
      let response;

      if (inputType === 'youtube') {
        response = await axios.post('/api/ingest', { url: youtubeUrl });
      } else {
        if (!file) {
          alert('Please select a file');
          setLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append('file', file);
        response = await axios.post('/api/ingest', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      const { jobId: newJobId } = response.data;
      setJobId(newJobId);

      // Poll for status
      pollStatus(newJobId);
    } catch (error) {
      console.error('Error:', error);
      alert('Error processing video');
      setLoading(false);
    }
  };

  const pollStatus = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`/api/status/${id}`);
        const jobStatus = response.data;
        setStatus(jobStatus);

        if (jobStatus.status === 'completed') {
          clearInterval(interval);
          setLoading(false);
          setMoments(jobStatus.result.moments);
        } else if (jobStatus.status === 'failed') {
          clearInterval(interval);
          setLoading(false);
          alert(`Error: ${jobStatus.error}`);
        }
      } catch (error) {
        console.error('Status check error:', error);
      }
    }, 2000);
  };

  const handleMomentSelect = (momentId: string) => {
    setSelectedMoments(prev =>
      prev.includes(momentId)
        ? prev.filter(id => id !== momentId)
        : [...prev, momentId]
    );
  };

  const handleProcessClips = async () => {
    if (selectedMoments.length === 0) {
      alert('Please select at least one moment');
      return;
    }

    setProcessingClips(true);
    setClipJobId(null);
    setClips([]);

    try {
      const response = await axios.post('/api/process', {
        jobId,
        momentIds: selectedMoments,
        config: {
          format: '9:16',
          addCaptions: true,
          addEmojis: true,
          addZoomPan: false, // Disabled by default as it's slow
        },
      });

      const { clipJobId: newClipJobId } = response.data;
      setClipJobId(newClipJobId);

      // Poll for clip status
      pollClipStatus(newClipJobId);
    } catch (error) {
      console.error('Error processing clips:', error);
      alert('Error processing clips');
      setProcessingClips(false);
    }
  };

  const pollClipStatus = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`/api/clips/${id}`);
        const clipStatus = response.data;

        if (clipStatus.status === 'completed') {
          clearInterval(interval);
          setProcessingClips(false);
          setClips(clipStatus.result);
        } else if (clipStatus.status === 'failed') {
          clearInterval(interval);
          setProcessingClips(false);
          alert(`Error: ${clipStatus.error}`);
        }
      } catch (error) {
        console.error('Clip status check error:', error);
      }
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black text-white">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500">
            AI Video Clipping Agent
          </h1>
          <p className="text-xl text-gray-300">
            Turn long videos into viral-ready clips with AI
          </p>
        </header>

        {/* Input Section */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-8 shadow-2xl">
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setInputType('youtube')}
              className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all ${
                inputType === 'youtube'
                  ? 'bg-red-600 text-white shadow-lg scale-105'
                  : 'bg-white/20 hover:bg-white/30'
              }`}
            >
              YouTube URL
            </button>
            <button
              onClick={() => setInputType('file')}
              className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all ${
                inputType === 'file'
                  ? 'bg-purple-600 text-white shadow-lg scale-105'
                  : 'bg-white/20 hover:bg-white/30'
              }`}
            >
              Upload File
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {inputType === 'youtube' ? (
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="Paste YouTube URL here..."
                className="w-full px-6 py-4 rounded-lg bg-white/20 border-2 border-white/30 placeholder-gray-400 text-white text-lg focus:outline-none focus:border-purple-500 transition-all"
                required
              />
            ) : (
              <div className="border-2 border-dashed border-white/30 rounded-lg p-8 text-center hover:border-purple-500 transition-all">
                <input
                  type="file"
                  accept="video/*,audio/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="text-6xl mb-4">📁</div>
                  {file ? (
                    <p className="text-lg text-green-400 font-semibold">{file.name}</p>
                  ) : (
                    <p className="text-lg text-gray-300">Click to select video or audio file</p>
                  )}
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 py-4 px-8 bg-gradient-to-r from-pink-600 to-purple-600 rounded-lg font-bold text-xl shadow-xl hover:shadow-2xl hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
            >
              {loading ? 'Processing...' : '✨ Analyze Video'}
            </button>
          </form>

          {status && (
            <div className="mt-6 p-4 bg-black/30 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold">{status.currentStep}</span>
                <span className="text-sm">{status.progress}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-green-500 to-blue-500 h-full transition-all duration-500"
                  style={{ width: `${status.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Viral Moments Section */}
        {moments.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-8 shadow-2xl">
            <h2 className="text-3xl font-bold mb-6">🔥 Viral Moments Detected</h2>
            <div className="space-y-4">
              {moments.map((moment) => (
                <div
                  key={moment.id}
                  onClick={() => handleMomentSelect(moment.id)}
                  className={`p-6 rounded-xl cursor-pointer transition-all ${
                    selectedMoments.includes(moment.id)
                      ? 'bg-purple-600/50 border-2 border-purple-400 shadow-lg scale-102'
                      : 'bg-white/5 border-2 border-transparent hover:bg-white/10'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl font-bold text-yellow-400">
                          {(moment.score * 10).toFixed(1)}/10
                        </span>
                        <span className="text-sm text-gray-400">
                          {formatTime(moment.start)} - {formatTime(moment.end)} ({(moment.end - moment.start).toFixed(0)}s)
                        </span>
                      </div>
                      <p className="text-lg mb-3 leading-relaxed">{moment.text}</p>
                      <div className="flex flex-wrap gap-2">
                        {moment.emotions.map((emotion) => (
                          <span
                            key={emotion}
                            className="px-3 py-1 bg-blue-500/30 rounded-full text-sm font-medium"
                          >
                            {emotion}
                          </span>
                        ))}
                        {moment.keywords.map((keyword) => (
                          <span
                            key={keyword}
                            className="px-3 py-1 bg-pink-500/30 rounded-full text-sm font-medium"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="ml-4">
                      {selectedMoments.includes(moment.id) && (
                        <span className="text-3xl">✅</span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-400 italic">{moment.reason}</p>
                </div>
              ))}
            </div>

            <button
              onClick={handleProcessClips}
              disabled={processingClips || selectedMoments.length === 0}
              className="w-full mt-8 py-4 px-8 bg-gradient-to-r from-green-600 to-blue-600 rounded-lg font-bold text-xl shadow-xl hover:shadow-2xl hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
            >
              {processingClips
                ? '⚙️ Generating Clips...'
                : `🎬 Generate ${selectedMoments.length} Clip${selectedMoments.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {/* Generated Clips Section */}
        {clips.length > 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl">
            <h2 className="text-3xl font-bold mb-6">🎥 Generated Clips</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  className="bg-white/5 rounded-xl overflow-hidden hover:bg-white/10 transition-all"
                >
                  <div className="p-4">
                    <div className="aspect-[9/16] bg-black/50 rounded-lg mb-4 flex items-center justify-center">
                      <span className="text-6xl">🎬</span>
                    </div>
                    <div className="mb-3">
                      <div className="text-sm text-gray-400 mb-1">
                        Duration: {clip.duration.toFixed(1)}s
                      </div>
                      <div className="text-sm text-gray-400 mb-1">
                        Score: {(clip.moment.score * 10).toFixed(1)}/10
                      </div>
                      <p className="text-sm line-clamp-2 text-gray-300">{clip.moment.text}</p>
                    </div>
                    <a
                      href={`/api/download/${clip.id}`}
                      download
                      className="block w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-bold text-center hover:shadow-lg transition-all"
                    >
                      ⬇️ Download Clip
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 text-center text-gray-400">
          <p className="text-sm">
            Powered by AI • OpenAI Whisper • GPT-4 • FFmpeg
          </p>
          <p className="text-xs mt-2">
            Ready for YouTube Shorts, TikTok, and Instagram Reels
          </p>
        </footer>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
