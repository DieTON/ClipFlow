import React, { useEffect, useState } from 'react';
import { Search, Play, Plus, Loader, Film, Check, Upload, ListVideo } from 'lucide-react';
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

interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  position: number;
}

export function GeneratorPage() {
  const [url, setUrl] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [suggestions, setSuggestions] = useState<SuggestedClip[]>([]);
  const [videoInfo, setVideoInfo] = useState<any>(null);
  const [savedList, setSavedList] = useState<SavedAnalysis[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [playlistVideos, setPlaylistVideos] = useState<PlaylistVideo[]>([]);
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
      console.error(e);
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
      toast.success('Loaded saved suggestions');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      toast.error('Could not load that video');
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setAnalyzing(true);
    setPlaylistVideos([]);
    try {
      const response = await api.post('/api/videos/analyze', { url });
      setVideoInfo(response.data.videoInfo);
      setSuggestions(response.data.suggestions);
      toast.success('Video analyzed!');
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

  const handleLoadPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistUrl) return;
    setLoadingPlaylist(true);
    setSuggestions([]);
    setVideoInfo(null);
    try {
      const res = await api.post('/api/videos/playlist', { url: playlistUrl });
      setPlaylistVideos(res.data.videos || []);
      toast.success(`Loaded ${res.data.count} videos — pick one to clip`);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          'Failed to load playlist',
      );
      setPlaylistVideos([]);
    } finally {
      setLoadingPlaylist(false);
    }
  };

  const handlePickPlaylistVideo = async (v: PlaylistVideo) => {
    setAnalyzing(true);
    try {
      const response = await api.post('/api/videos/analyze', {
        videoId: v.videoId,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      });
      setVideoInfo(response.data.videoInfo);
      setSuggestions(response.data.suggestions);
      setUrl(`https://www.youtube.com/watch?v=${v.videoId}`);
      toast.success(`Analyzing: ${v.title.slice(0, 40)}…`);
      await loadSavedList();
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error || 'Failed to analyze that video',
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
      setPlaylistVideos([]);
      toast.success('Uploaded video analyzed!');
      await loadSavedList();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error || 'Failed to upload / analyze file',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleCreateClip = async (suggestion: SuggestedClip) => {
    if (!videoInfo?.videoId) return;
    if (suggestion.alreadyCreated) {
      toast('Already created');
      return;
    }
    if (addLogo && !hasLogo) {
      toast.error('Upload a logo first, or turn off Add brand logo');
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
      toast.success('Clip created — check Dashboard progress');
    } catch {
      toast.error('Failed to create clip');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Clip Generator</h1>
        <p className="text-slate-600 mt-2">
          Single video, playlist (pick one), or file upload.
        </p>
      </div>

      <form onSubmit={handleAnalyze} className="card space-y-3">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Search size={20} /> Single YouTube video
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="input flex-1"
          />
          <button type="submit" disabled={analyzing} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {analyzing ? <Loader size={20} className="animate-spin" /> : <Search size={20} />}
            Analyze
          </button>
        </div>
      </form>

      <form onSubmit={handleLoadPlaylist} className="card space-y-3 border border-blue-100 bg-blue-50/30">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <ListVideo size={20} /> YouTube playlist
        </h2>
        <p className="text-sm text-slate-600">
          Paste a playlist link (must include <code className="text-xs bg-white px-1 rounded">list=</code>). Then click a video to analyze it.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="https://youtube.com/playlist?list=..."
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            className="input flex-1"
          />
          <button type="submit" disabled={loadingPlaylist} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {loadingPlaylist ? <Loader size={20} className="animate-spin" /> : <ListVideo size={20} />}
            Load
          </button>
        </div>

        {playlistVideos.length > 0 && (
          <div className="mt-3 max-h-80 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-2 bg-white">
            <p className="text-xs text-slate-500 px-1">{playlistVideos.length} videos — click one:</p>
            {playlistVideos.map((v) => (
              <button
                key={v.videoId}
                type="button"
                disabled={analyzing}
                onClick={() => handlePickPlaylistVideo(v)}
                className="w-full flex gap-3 p-2 rounded-lg hover:bg-blue-50 text-left disabled:opacity-50"
              >
                {v.thumbnail ? (
                  <img src={v.thumbnail} alt="" className="w-24 h-14 object-cover rounded flex-shrink-0" />
                ) : (
                  <div className="w-24 h-14 bg-slate-200 rounded flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 line-clamp-2">{v.title}</p>
                  <p className="text-xs text-slate-500">{v.channelTitle || 'YouTube'}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </form>

      <form onSubmit={handleUploadAnalyze} className="card space-y-3 border-2 border-dashed border-slate-200">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Upload size={20} /> Video file
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
            Upload & analyze
          </button>
        </div>
      </form>

      <div className="card space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Brand logo</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-primary cursor-pointer inline-flex items-center gap-2">
            {logoUploading ? <Loader size={18} className="animate-spin" /> : <Upload size={18} />}
            Upload logo
            <input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleLogoUpload} />
          </label>
          <span className={`text-sm ${hasLogo ? 'text-green-700' : 'text-slate-500'}`}>
            {hasLogo ? 'Logo saved' : 'No logo yet'}
          </span>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Film size={20} /> Saved videos
        </h2>
        {loadingSaved ? (
          <p className="text-sm text-slate-600">Loading...</p>
        ) : savedList.length === 0 ? (
          <p className="text-sm text-slate-600">None yet</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {savedList.map((item) => (
              <button key={item.id} type="button" onClick={() => openSaved(item.videoId)} className="flex gap-3 p-3 rounded-lg border hover:bg-blue-50 text-left">
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" className="w-20 h-14 object-cover rounded" />
                ) : (
                  <div className="w-20 h-14 bg-slate-200 rounded text-xs flex items-center justify-center">YT</div>
                )}
                <p className="text-sm font-medium line-clamp-2">{item.title}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {videoInfo && (
        <div className="card">
          <h2 className="text-xl font-bold">{videoInfo.title}</h2>
          <p className="text-sm text-slate-500 mt-1">Duration: {videoInfo.duration}</p>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <h2 className="text-2xl font-bold w-full">Suggestions</h2>
            <label className="flex items-center gap-2 bg-slate-50 border rounded-lg px-4 py-2 cursor-pointer">
              <input type="checkbox" checked={burnCaptions} onChange={(e) => setBurnCaptions(e.target.checked)} />
              <span className="text-sm font-medium">Captions</span>
            </label>
            <label className="flex items-center gap-2 bg-slate-50 border rounded-lg px-4 py-2 cursor-pointer">
              <input type="checkbox" checked={addLogo} onChange={(e) => setAddLogo(e.target.checked)} />
              <span className="text-sm font-medium">Brand logo</span>
            </label>
          </div>
          {suggestions.map((s, idx) => (
            <div key={idx} className="card flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Play size={16} className="text-blue-600" />
                  {s.startSeconds}s – {s.startSeconds + s.duration}s
                  {s.label && <span className="bg-slate-100 px-2 rounded text-xs">{s.label}</span>}
                </div>
                <p className="font-medium mt-1">{s.reason}</p>
              </div>
              {s.alreadyCreated ? (
                <span className="text-green-700 text-sm flex items-center gap-1"><Check size={16} /> Created</span>
              ) : (
                <button onClick={() => handleCreateClip(s)} className="btn-primary flex items-center gap-2">
                  <Plus size={18} /> Create
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
