import React, { useEffect, useState } from 'react';
import { Search, Play, Plus, Loader, Film, Check, Upload } from 'lucide-react';
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
  const [uploading, setUploading] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [suggestions, setSuggestions] = useState<SuggestedClip[]>([]);
  const [videoInfo, setVideoInfo] = useState<any>(null);
  const [savedList, setSavedList] = useState<SavedAnalysis[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [burnCaptions, setBurnCaptions] = useState(true);
  const [addLogo, setAddLogo] = useState(false);
  const [hasLogo, setHasLogo] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
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

  const loadLogoStatus = async () => {
    try {
      const res = await api.get('/api/videos/logo');
      setHasLogo(!!res.data.hasLogo);
    } catch {
      setHasLogo(false);
    }
  };

  useEffect(() => {
    loadSavedList();
    loadLogoStatus();
  }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const form = new FormData();
      form.append('logo', file);
      await api.post('/api/videos/logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setHasLogo(true);
      setAddLogo(true);
      toast.success('Brand logo saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Logo upload failed');
    } finally {
      setLogoUploading(false);
    }
  };

  const openSaved = async (videoId: string) => {
    try {
      const res = await api.get(`/api/videos/analyses/${videoId}`);
      setVideoInfo(res.data.videoInfo);
      setSuggestions(res.data.suggestions || []);
      if (!String(videoId).startsWith('file_')) {
        setUrl(
          res.data.analysis?.sourceUrl ||
            `https://www.youtube.com/watch?v=${videoId}`,
        );
      }
      toast.success('Loaded saved suggestions');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast.error('Could not load that video');
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
      toast.success('YouTube video analyzed and saved!');
      await loadSavedList();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          'Failed to analyze video',
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleUploadAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Choose a video file first');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('video', selectedFile);
      form.append('title', selectedFile.name.replace(/\.[^.]+$/, ''));
      const response = await api.post('/api/videos/analyze-upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30 * 60 * 1000,
      });
      setVideoInfo(response.data.videoInfo);
      setSuggestions(response.data.suggestions);
      setUrl('');
      toast.success('Uploaded video analyzed!');
      await loadSavedList();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          'Failed to upload / analyze file',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleCreateClip = async (suggestion: SuggestedClip) => {
    if (!videoInfo?.videoId) return;
    if (suggestion.alreadyCreated) {
      toast('This suggestion was already created');
      return;
    }
    if (addLogo && !hasLogo) {
      toast.error('Upload a brand logo first, or turn off Add brand logo');
      return;
    }
    try {
      const response = await api.post('/api/clips', {
        videoId: videoInfo.videoId,
        title: `${videoInfo.title} - ${suggestion.label || 'Clip'}`,
        startSeconds: suggestion.startSeconds,
        duration: suggestion.duration,
        sourcePath: videoInfo.sourcePath,
        burnCaptions,
        addLogo,
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
      toast.success('Clip created — watch progress on Dashboard');
    } catch (error) {
      toast.error('Failed to create clip');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Clip Generator</h1>
        <p className="text-slate-600 mt-2">
          YouTube link or file upload. Optional captions and brand logo.
        </p>
      </div>

      <form onSubmit={handleAnalyze} className="card space-y-3">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Search size={20} /> From YouTube link
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Paste YouTube URL here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="input flex-1"
          />
          <button type="submit" disabled={analyzing} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {analyzing ? <Loader size={20} className="animate-spin" /> : <Search size={20} />}
            {analyzing ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </form>

      <form onSubmit={handleUploadAnalyze} className="card space-y-3 border-2 border-dashed border-slate-200">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Upload size={20} /> From video file
        </h2>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="file"
            accept="video/*,.mp4,.mov,.webm,.mkv"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:font-medium"
          />
          <button type="submit" disabled={uploading || !selectedFile} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap">
            {uploading ? <Loader size={20} className="animate-spin" /> : <Upload size={20} />}
            {uploading ? 'Uploading...' : 'Upload & analyze'}
          </button>
        </div>
      </form>

      <div className="card space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Brand logo (watermark)</h2>
        <p className="text-sm text-slate-600">
          Upload the PNG/JPG the campaign gave you. Then tick “Add brand logo” when creating clips.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-primary cursor-pointer inline-flex items-center gap-2 opacity-90">
            {logoUploading ? <Loader size={18} className="animate-spin" /> : <Upload size={18} />}
            {logoUploading ? 'Uploading…' : 'Upload logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleLogoUpload} />
          </label>
          <span className={`text-sm font-medium ${hasLogo ? 'text-green-700' : 'text-slate-500'}`}>
            {hasLogo ? 'Logo saved on this PC' : 'No logo uploaded yet'}
          </span>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Film size={20} /> Saved videos
        </h2>
        {loadingSaved ? (
          <p className="text-slate-600 text-sm">Loading...</p>
        ) : savedList.length === 0 ? (
          <p className="text-slate-600 text-sm">No saved analyses yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {savedList.map((item) => (
              <button key={item.id} type="button" onClick={() => openSaved(item.videoId)} className="flex gap-3 p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-left">
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" className="w-20 h-14 object-cover rounded flex-shrink-0" />
                ) : (
                  <div className="w-20 h-14 bg-slate-200 rounded flex-shrink-0 flex items-center justify-center text-xs text-slate-500">
                    {String(item.videoId).startsWith('file_') ? 'FILE' : 'YT'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 text-sm line-clamp-2">{item.title}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {videoInfo && (
        <div className="card">
          <h2 className="text-2xl font-bold text-slate-900">{videoInfo.title}</h2>
          <p className="text-sm text-slate-500 mt-2">Duration: {videoInfo.duration}</p>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-bold text-slate-900">Suggestions</h2>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                <input type="checkbox" checked={burnCaptions} onChange={(e) => setBurnCaptions(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm font-medium">Add captions</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                <input type="checkbox" checked={addLogo} onChange={(e) => setAddLogo(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm font-medium">Add brand logo</span>
              </label>
            </div>
          </div>

          <div className="grid gap-4">
            {suggestions.map((suggestion, idx) => (
              <div key={idx} className="card">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Play size={18} className="text-blue-600" />
                      <span className="text-sm font-medium text-slate-600">
                        {suggestion.startSeconds}s – {suggestion.startSeconds + suggestion.duration}s
                      </span>
                      {suggestion.label && (
                        <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{suggestion.label}</span>
                      )}
                    </div>
                    <p className="text-slate-900 font-medium">{suggestion.reason}</p>
                  </div>
                  {suggestion.alreadyCreated ? (
                    <span className="flex items-center gap-1 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                      <Check size={16} /> Created
                    </span>
                  ) : (
                    <button onClick={() => handleCreateClip(suggestion)} className="btn-primary flex items-center gap-2">
                      <Plus size={20} /> Create
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
