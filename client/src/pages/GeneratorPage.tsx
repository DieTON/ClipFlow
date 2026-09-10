import React, { useEffect, useState } from 'react';
import { Search, Play, Plus, Loader, Film, Check } from 'lucide-react';
import api from '../lib/api';
import { useClipStore } from '../store/clipStore';
import toast from 'react-hot-toast';

interface SuggestedClip {
  startSeconds: number;
  duration: number;
  score: number;
  reason: string;
  label?: string;
  alreadyCreated?: boolean;
  clipStatus?: string;
}

interface SavedAnalysis {
  id: string;
  videoId: string;
  title: string;
  thumbnail?: string;
  duration?: string;
  channelTitle?: string;
  updatedAt: string;
}

export function GeneratorPage() {
  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [suggestions, setSuggestions] = useState<SuggestedClip[]>([]);
  const [videoInfo, setVideoInfo] = useState<any>(null);
  const [savedList, setSavedList] = useState<SavedAnalysis[]>([]);
  const addClip = useClipStore((s) => s.addClip);

  const loadSavedList = async () => {
    try {
      const res = await api.get('/api/videos/analyses');
      setSavedList(res.data.analyses || []);
    } catch (e) {
      console.error('Failed to load saved analyses', e);
    } finally {
      setLoadingSaved(false);
    }
  };

  useEffect(() => {
    loadSavedList();
  }, []);

  const openSaved = async (videoId: string) => {
    try {
      const res = await api.get(`/api/videos/analyses/${videoId}`);
      setVideoInfo(res.data.videoInfo);
      setSuggestions(res.data.suggestions || []);
      setUrl(res.data.analysis?.sourceUrl || `https://www.youtube.com/watch?v=${videoId}`);
      toast.success('Loaded saved suggestions');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast.error('Could not load that video');
      console.error(e);
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setAnalyzing(true);
    try {
      const response = await api.post('/api/videos/analyze', { url });
      setVideoInfo(response.data.videoInfo);
      setSuggestions(response.data.suggestions);
      toast.success('Video analyzed and saved!');
      await loadSavedList();
    } catch (error) {
      toast.error('Failed to analyze video');
      console.error('Analysis failed:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCreateClip = async (suggestion: SuggestedClip) => {
    if (!videoInfo?.videoId) return;
    if (suggestion.alreadyCreated) {
      toast('This suggestion was already created');
      return;
    }

    try {
      const response = await api.post('/api/clips', {
        videoId: videoInfo.videoId,
        title: `${videoInfo.title} - ${suggestion.label || 'Clip'}`,
        startSeconds: suggestion.startSeconds,
        duration: suggestion.duration,
      });
      addClip(response.data);
      setSuggestions((prev) =>
        prev.map((s) =>
          s.startSeconds === suggestion.startSeconds &&
          s.duration === suggestion.duration
            ? { ...s, alreadyCreated: true, clipStatus: 'processing' }
            : s,
        ),
      );
      toast.success('Clip created — processing in background');
    } catch (error) {
      toast.error('Failed to create clip');
      console.error('Creation failed:', error);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Clip Generator</h1>
        <p className="text-slate-600 mt-2">
          Paste a YouTube URL once. Suggestions are saved — come back anytime and create more clips from the same video.
        </p>
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

      {/* Saved videos */}
      <div className="card">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Film size={20} />
          Saved videos
        </h2>
        {loadingSaved ? (
          <p className="text-slate-600 text-sm">Loading...</p>
        ) : savedList.length === 0 ? (
          <p className="text-slate-600 text-sm">
            No saved analyses yet. Analyze a link above — it will appear here so you can reopen it later.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {savedList.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openSaved(item.videoId)}
                className="flex gap-3 p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-left transition-colors"
              >
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="w-20 h-14 object-cover rounded flex-shrink-0"
                  />
                ) : (
                  <div className="w-20 h-14 bg-slate-200 rounded flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 text-sm line-clamp-2">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Click to open suggestions again
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {videoInfo && (
        <div className="card">
          <div className="flex gap-6">
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
              <p className="text-sm text-slate-500 mt-4">
                Duration: {videoInfo.duration}
              </p>
            </div>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Suggestions</h2>
          <p className="text-slate-600 text-sm">
            Create one now, leave, and come back later for the other parts of the same video.
          </p>
          <div className="grid gap-4">
            {suggestions.map((suggestion, idx) => (
              <div key={idx} className="card">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Play size={18} className="text-blue-600" />
                      <span className="text-sm font-medium text-slate-600">
                        {suggestion.startSeconds}s –{' '}
                        {suggestion.startSeconds + suggestion.duration}s
                      </span>
                      {suggestion.label && (
                        <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">
                          {suggestion.label}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-900 font-medium">{suggestion.reason}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-green-500 h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (suggestion.score || 0) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-600">
                        {((suggestion.score || 0) * 100).toFixed(0)}% match
                      </span>
                    </div>
                  </div>
                  {suggestion.alreadyCreated ? (
                    <span className="flex items-center gap-1 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg whitespace-nowrap">
                      <Check size={16} />
                      Created{suggestion.clipStatus ? ` (${suggestion.clipStatus})` : ''}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleCreateClip(suggestion)}
                      className="btn-primary flex items-center gap-2 whitespace-nowrap"
                    >
                      <Plus size={20} />
                      Create
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
