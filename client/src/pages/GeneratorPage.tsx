import React, { useState } from 'react';
import { Search, Play, Plus, Loader } from 'lucide-react';
import api from '../lib/api';
import { useClipStore } from '../store/clipStore';
import toast from 'react-hot-toast';

interface SuggestedClip {
  startSeconds: number;
  duration: number;
  score: number;
  reason: string;
}

export function GeneratorPage() {
  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedClip[]>([]);
  const [videoInfo, setVideoInfo] = useState<any>(null);
  const addClip = useClipStore((s) => s.addClip);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setAnalyzing(true);
    try {
      const response = await api.post('/api/videos/analyze', { url });
      setVideoInfo(response.data.videoInfo);
      setSuggestions(response.data.suggestions);
      toast.success('Video analyzed successfully!');
    } catch (error) {
      toast.error('Failed to analyze video');
      console.error('Analysis failed:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCreateClip = async (suggestion: SuggestedClip) => {
    try {
      const response = await api.post('/api/clips', {
        videoId: videoInfo.videoId,
        title: `${videoInfo.title} - Clip`,
        startSeconds: suggestion.startSeconds,
        duration: suggestion.duration,
      });
      addClip(response.data);
      toast.success('Clip created successfully!');
    } catch (error) {
      toast.error('Failed to create clip');
      console.error('Creation failed:', error);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Clip Generator</h1>
        <p className="text-slate-600 mt-2">Paste a YouTube URL and AI will suggest the best clips</p>
      </div>

      <form onSubmit={handleAnalyze} className="card">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Paste YouTube URL here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="input flex-1"
          />
          <button
            type="submit"
            disabled={analyzing}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {analyzing ? (
              <Loader size={20} className="animate-spin" />
            ) : (
              <Search size={20} />
            )}
            {analyzing ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </form>

      {videoInfo && (
        <div className="card">
          <div className="flex gap-6 mb-8">
            {videoInfo.thumbnail && (
              <img
                src={videoInfo.thumbnail}
                alt={videoInfo.title}
                className="w-32 h-32 rounded-lg object-cover"
              />
            )}
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-slate-900">{videoInfo.title}</h2>
              <p className="text-slate-600 mt-2">{videoInfo.description}</p>
              <p className="text-sm text-slate-500 mt-4">Duration: {videoInfo.duration}s</p>
            </div>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">AI Suggestions</h2>
          <div className="grid gap-4">
            {suggestions.map((suggestion, idx) => (
              <div key={idx} className="card">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Play size={18} className="text-blue-600" />
                      <span className="text-sm font-medium text-slate-600">
                        {suggestion.startSeconds}s - {suggestion.startSeconds + suggestion.duration}s
                      </span>
                    </div>
                    <p className="text-slate-900 font-medium">{suggestion.reason}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-green-500 h-full rounded-full"
                          style={{ width: `${suggestion.score * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-600">
                        {(suggestion.score * 100).toFixed(0)}% match
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCreateClip(suggestion)}
                    className="btn-primary ml-4 flex items-center gap-2"
                  >
                    <Plus size={20} />
                    Create
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
