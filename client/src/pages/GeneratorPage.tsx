import React, { useEffect, useState } from 'react';
import { Search, Play, Plus, Loader, Film, Check, Upload, ListVideo, Copy } from 'lucide-react';
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
  hook?: string;
  hashtags?: string;
  suggestedTitle?: string;
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

function suggestionKey(s: SuggestedClip) {
  return `${s.startSeconds}-${s.duration}`;
}

export function GeneratorPage() {
  const [url, setUrl] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [batchCreating, setBatchCreating] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedClip[]>([]);
  const [videoInfo, setVideoInfo] = useState<any>(null);
  const [savedList, setSavedList] = useState<SavedAnalysis[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [playlistVideos, setPlaylistVideos] = useState<PlaylistVideo[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
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

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy');
    }
  };

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
      setSelectedKeys(new Set());
      toast.success('Loaded saved suggestions');
    } catch {
      toast.error('Could not load that video');
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setAnalyzing(true);
    setPlaylistVideos([]);
    setSelectedKeys(new Set());
    try {
      const response = await api.post('/api/videos/analyze', { url });
      setVideoInfo(response.data.videoInfo);
      setSuggestions(response.data.suggestions);
      toast.success(
        response.data.smartSuggestions
          ? 'Analyzed with smart transcript suggestions!'
          : 'Video analyzed!',
      );
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
    setSelectedKeys(new Set());
    try {
      const res = await api.post('/api/videos/playlist', { url: playlistUrl });
      setPlaylistVideos(res.data.videos || []);
      toast.success(`Loaded ${res.data.count} videos — pick one`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to load playlist');
      setPlaylistVideos([]);
    } finally {
      setLoadingPlaylist(false);
    }
  };

  const handlePickPlaylistVideo = async (v: PlaylistVideo) => {
    setAnalyzing(true);
    setSelectedKeys(new Set());
    try {
      const response = await api.post('/api/videos/analyze', {
        videoId: v.videoId,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      });
      setVideoInfo(response.data.videoInfo);
      setSuggestions(response.data.suggestions);
      setUrl(`https://www.youtube.com/watch?v=${v.videoId}`);
      toast.success(`Analyzed: ${v.title.slice(0, 40)}…`);
      await loadSavedList();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to analyze');
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
    setSelectedKeys(new Set());
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
      toast.error(error?.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const toggleSelect = (s: SuggestedClip) => {
    if (s.alreadyCreated) return;
    const key = suggestionKey(s);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectable = suggestions.filter((s) => !s.alreadyCreated);
  const allSelected =
    selectable.length > 0 &&
    selectable.every((s) => selectedKeys.has(suggestionKey(s)));

  const toggleSelectAll = () => {
    if (allSelected) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(selectable.map(suggestionKey)));
  };

  const titleFor = (s: SuggestedClip) =>
    s.suggestedTitle ||
    s.hook ||
    `${videoInfo?.title || 'Clip'} - ${s.label || 'Clip'}`;

  const createOne = async (suggestion: SuggestedClip) => {
    const response = await api.post('/api/clips', {
      videoId: videoInfo.videoId,
      title: titleFor(suggestion),
      description: suggestion.hashtags || '',
      startSeconds: suggestion.startSeconds,
      duration: suggestion.duration,
      sourcePath: videoInfo.sourcePath,
      burnCaptions,
      addLogo,
    });
    addClip(response.data);
    return response.data;
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
      await createOne(suggestion);
      setSuggestions((prev) =>
        prev.map((s) =>
          s.startSeconds === suggestion.startSeconds &&
          s.duration === suggestion.duration
            ? { ...s, alreadyCreated: true, clipStatus: 'processing' }
            : s,
        ),
      );
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        next.delete(suggestionKey(suggestion));
        return next;
      });
      toast.success('Clip created — check Dashboard');
    } catch {
      toast.error('Failed to create clip');
    }
  };

  const handleBatchCreate = async () => {
    if (!videoInfo?.videoId) return;
    if (addLogo && !hasLogo) {
      toast.error('Upload a logo first, or turn off Add brand logo');
      return;
    }
    const toCreate = suggestions.filter(
      (s) => !s.alreadyCreated && selectedKeys.has(suggestionKey(s)),
    );
    if (toCreate.length === 0) {
      toast.error('Select at least one');
      return;
    }

    setBatchCreating(true);
    let ok = 0;
    let fail = 0;
    for (const s of toCreate) {
      try {
        await createOne(s);
        ok++;
        setSuggestions((prev) =>
          prev.map((x) =>
            x.startSeconds === s.startSeconds && x.duration === s.duration
              ? { ...x, alreadyCreated: true, clipStatus: 'processing' }
              : x,
          ),
        );
      } catch {
        fail++;
      }
    }
    setSelectedKeys(new Set());
    setBatchCreating(false);
    if (ok) toast.success(`${ok} queued — Dashboard`);
    if (fail) toast.error(`${fail} failed`);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Clip Generator</h1>
        <p className="text-slate-600 mt-2">
          Fill-frame Shorts, smart titles & hashtags, batch create.
        </p>
      </div>

      <form onSubmit={handleAnalyze} className="card space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Search size={20} /> Single YouTube video
        </h2>
        <div className="flex gap-2">
          <input type="text" placeholder="https://youtube.com/watch?v=..." value={url} onChange={(e) => setUrl(e.target.value)} className="input flex-1" />
          <button type="submit" disabled={analyzing} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {analyzing ? <Loader size={20} className="animate-spin" /> : <Search size={20} />}
            Analyze
          </button>
        </div>
      </form>

      <form onSubmit={handleLoadPlaylist} className="card space-y-3 border border-blue-100 bg-blue-50/30">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ListVideo size={20} /> Playlist
        </h2>
        <div className="flex gap-2">
          <input type="text" placeholder="playlist?list=..." value={playlistUrl} onChange={(e) => setPlaylistUrl(e.target.value)} className="input flex-1" />
          <button type="submit" disabled={loadingPlaylist} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {loadingPlaylist ? <Loader size={20} className="animate-spin" /> : <ListVideo size={20} />}
            Load
          </button>
        </div>
        {playlistVideos.length > 0 && (
          <div className="mt-3 max-h-80 overflow-y-auto space-y-2 border rounded-lg p-2 bg-white">
            {playlistVideos.map((v) => (
              <button key={v.videoId} type="button" disabled={analyzing} onClick={() => handlePickPlaylistVideo(v)} className="w-full flex gap-3 p-2 rounded-lg hover:bg-blue-50 text-left disabled:opacity-50">
                {v.thumbnail ? <img src={v.thumbnail} alt="" className="w-24 h-14 object-cover rounded" /> : <div className="w-24 h-14 bg-slate-200 rounded" />}
                <p className="text-sm font-medium line-clamp-2">{v.title}</p>
              </button>
            ))}
          </div>
        )}
      </form>

      <form onSubmit={handleUploadAnalyze} className="card space-y-3 border-2 border-dashed">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Upload size={20} /> Video file
        </h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="file" accept="video/*,.mp4,.mov,.webm,.mkv" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100" />
          <button type="submit" disabled={uploading || !selectedFile} className="btn-primary disabled:opacity-50 whitespace-nowrap">
            {uploading ? 'Uploading…' : 'Upload & analyze'}
          </button>
        </div>
      </form>

      <div className="card space-y-3">
        <h2 className="text-lg font-bold">Brand logo</h2>
        <label className="btn-primary cursor-pointer inline-flex items-center gap-2">
          {logoUploading ? <Loader size={18} className="animate-spin" /> : <Upload size={18} />}
          Upload logo
          <input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleLogoUpload} />
        </label>
        <span className={`text-sm ml-2 ${hasLogo ? 'text-green-700' : 'text-slate-500'}`}>{hasLogo ? 'Logo saved' : 'No logo yet'}</span>
      </div>

      <div className="card">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Film size={20} /> Saved videos</h2>
        {loadingSaved ? <p className="text-sm text-slate-600">Loading...</p> : savedList.length === 0 ? <p className="text-sm text-slate-600">None yet</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {savedList.map((item) => (
              <button key={item.id} type="button" onClick={() => openSaved(item.videoId)} className="flex gap-3 p-3 rounded-lg border hover:bg-blue-50 text-left">
                {item.thumbnail ? <img src={item.thumbnail} alt="" className="w-20 h-14 object-cover rounded" /> : <div className="w-20 h-14 bg-slate-200 rounded text-xs flex items-center justify-center">YT</div>}
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
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold">Suggestions</h2>
            <label className="flex items-center gap-2 bg-slate-50 border rounded-lg px-4 py-2 cursor-pointer">
              <input type="checkbox" checked={burnCaptions} onChange={(e) => setBurnCaptions(e.target.checked)} />
              <span className="text-sm font-medium">Captions</span>
            </label>
            <label className="flex items-center gap-2 bg-slate-50 border rounded-lg px-4 py-2 cursor-pointer">
              <input type="checkbox" checked={addLogo} onChange={(e) => setAddLogo(e.target.checked)} />
              <span className="text-sm font-medium">Brand logo</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border rounded-xl">
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4" />
              Select all
            </label>
            <span className="text-sm text-slate-600">{selectedKeys.size} selected</span>
            <button type="button" disabled={batchCreating || selectedKeys.size === 0} onClick={handleBatchCreate} className="btn-primary flex items-center gap-2 disabled:opacity-50 ml-auto">
              {batchCreating ? <Loader size={18} className="animate-spin" /> : <Plus size={18} />}
              {batchCreating ? 'Creating…' : `Create selected (${selectedKeys.size})`}
            </button>
          </div>

          {suggestions.map((s, idx) => {
            const key = suggestionKey(s);
            const isChecked = selectedKeys.has(key);
            const title = titleFor(s);
            return (
              <div key={idx} className={`card space-y-2 ${isChecked ? 'ring-2 ring-blue-400' : ''}`}>
                <div className="flex items-start gap-4">
                  {!s.alreadyCreated && (
                    <input type="checkbox" checked={isChecked} onChange={() => toggleSelect(s)} className="w-5 h-5 mt-1 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Play size={16} className="text-blue-600" />
                      {s.startSeconds}s – {s.startSeconds + s.duration}s
                      {s.label && <span className="bg-slate-100 px-2 rounded text-xs">{s.label}</span>}
                    </div>
                    <p className="font-medium mt-1">{s.reason}</p>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="text-slate-500 shrink-0">Title:</span>
                        <span className="text-slate-900 flex-1">{title}</span>
                        <button type="button" onClick={() => copyText(title, 'Title')} className="text-blue-600 hover:text-blue-800 p-1" title="Copy title">
                          <Copy size={14} />
                        </button>
                      </div>
                      {s.hashtags && (
                        <div className="flex items-start gap-2">
                          <span className="text-slate-500 shrink-0">Tags:</span>
                          <span className="text-slate-700 flex-1 text-xs">{s.hashtags}</span>
                          <button type="button" onClick={() => copyText(s.hashtags!, 'Hashtags')} className="text-blue-600 hover:text-blue-800 p-1" title="Copy hashtags">
                            <Copy size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {s.alreadyCreated ? (
                    <span className="text-green-700 text-sm flex items-center gap-1 shrink-0"><Check size={16} /> Created</span>
                  ) : (
                    <button onClick={() => handleCreateClip(s)} className="btn-primary flex items-center gap-2 shrink-0">
                      <Plus size={18} /> Create
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
