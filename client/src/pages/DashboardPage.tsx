import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Film,
  Calendar,
  TrendingUp,
  Play,
  X,
  ExternalLink,
  Download,
  RotateCcw,
  FolderOpen,
} from 'lucide-react';
import { useClipStore, Clip } from '../store/clipStore';
import api from '../lib/api';
import toast from 'react-hot-toast';

interface Stats {
  totalClips: number;
  totalViews: number;
  avgEngagement: number;
  scheduledClips: number;
}

function ProgressBar({ clip }: { clip: Clip }) {
  const isProcessing = clip.status === 'processing' || clip.status === 'draft';
  const pct =
    typeof clip.progressPercent === 'number'
      ? clip.progressPercent
      : isProcessing
        ? 5
        : clip.status === 'ready' || clip.status === 'published'
          ? 100
          : 0;
  const label =
    clip.progressLabel ||
    (clip.status === 'ready'
      ? 'Ready'
      : clip.status === 'failed'
        ? 'Failed'
        : clip.status === 'published'
          ? 'Published'
          : 'Working…');

  if (clip.status === 'failed') {
    return (
      <div className="mt-2 w-full max-w-xs">
        <p className="text-xs text-red-600 mb-1 line-clamp-2">{label}</p>
        <div className="h-2 bg-red-100 rounded-full overflow-hidden">
          <div className="h-full bg-red-400 w-full" />
        </div>
      </div>
    );
  }

  if (clip.status === 'ready' || clip.status === 'published') {
    return (
      <div className="mt-2 w-full max-w-xs">
        <p className="text-xs text-green-700 mb-1">{label}</p>
        <div className="h-2 bg-green-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 w-full max-w-xs">
      <div className="flex justify-between text-xs text-slate-600 mb-1">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
        />
      </div>
    </div>
  );
}

function PreviewModal({
  clip,
  onClose,
}: {
  clip: Clip;
  onClose: () => void;
}) {
  const src = clip.videoUrl;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate text-sm">
              {clip.title}
            </p>
            <p className="text-xs text-slate-500">
              {clip.duration}s · {clip.status}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="bg-black flex items-center justify-center aspect-[9/16] max-h-[70vh]">
          {src ? (
            <video
              key={src}
              src={src}
              controls
              autoPlay
              playsInline
              className="max-h-[70vh] w-full object-contain"
            />
          ) : (
            <p className="text-white text-sm p-6 text-center">
              No video URL. Check Videos\\ClipFlow on your PC.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 p-4 border-t border-slate-100">
          {src && (
            <>
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 px-3 py-2 rounded-lg hover:bg-blue-50"
              >
                <ExternalLink size={16} />
                Open in new tab
              </a>
              <a
                href={src}
                download
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50"
              >
                <Download size={16} />
                Download
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalClips: 0,
    totalViews: 0,
    avgEngagement: 0,
    scheduledClips: 0,
  });
  const [loading, setLoading] = useState(true);
  const [previewClip, setPreviewClip] = useState<Clip | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const { clips, setClips } = useClipStore();

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const [statsRes, clipsRes] = await Promise.all([
          api.get('/api/analytics/overview'),
          api.get('/api/clips'),
        ]);
        if (cancelled) return;
        setStats({
          totalClips: statsRes.data.totalClips ?? 0,
          totalViews: statsRes.data.totalViews ?? 0,
          avgEngagement: statsRes.data.avgEngagement ?? 0,
          scheduledClips:
            statsRes.data.scheduledClips ?? statsRes.data.totalScheduled ?? 0,
        });
        const list = clipsRes.data.clips || clipsRes.data || [];
        setClips(Array.isArray(list) ? list : []);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();

    const interval = setInterval(async () => {
      try {
        const clipsRes = await api.get('/api/clips');
        if (cancelled) return;
        const list = clipsRes.data.clips || [];
        setClips(Array.isArray(list) ? list : []);
      } catch {
        /* ignore */
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setClips]);

  const handleRetry = async (clip: Clip) => {
    setRetryingId(clip.id);
    try {
      await api.post(`/api/clips/${clip.id}/retry`, {});
      toast.success('Retry queued — watch progress');
      setClips(
        clips.map((c) =>
          c.id === clip.id
            ? {
                ...c,
                status: 'processing',
                progressPercent: 2,
                progressLabel: 'Retry queued',
              }
            : c,
        ),
      );
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  const openVideosFolder = () => {
    toast(
      'On your PC open: C:\\Users\\anton\\Videos\\ClipFlow',
      { duration: 5000 },
    );
  };

  const StatCard = ({
    icon: Icon,
    label,
    value,
  }: {
    icon: any;
    label: string;
    value: string | number;
  }) => (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-600 text-sm font-medium">{label}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
        </div>
        <div className="p-3 bg-blue-100 rounded-lg">
          <Icon className="text-blue-600" size={24} />
        </div>
      </div>
    </div>
  );

  const canPreview = (clip: Clip) =>
    !!clip.videoUrl &&
    (clip.status === 'ready' || clip.status === 'published');

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-600 mt-2">
            Progress, preview, and retry failed clips.
          </p>
        </div>
        <button
          type="button"
          onClick={openVideosFolder}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg"
        >
          <FolderOpen size={18} />
          Clip files folder
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-slate-600">Loading stats...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard icon={Film} label="Total Clips" value={stats.totalClips} />
            <StatCard
              icon={TrendingUp}
              label="Total Views"
              value={stats.totalViews.toLocaleString()}
            />
            <StatCard
              icon={BarChart3}
              label="Avg Engagement"
              value={`${Number(stats.avgEngagement).toFixed(1)}%`}
            />
            <StatCard
              icon={Calendar}
              label="Scheduled"
              value={stats.scheduledClips}
            />
          </div>

          <div className="card">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              Recent Clips
            </h2>
            {clips.length === 0 ? (
              <p className="text-slate-600">
                No clips yet. Start by creating one in the Generator!
              </p>
            ) : (
              <div className="space-y-4">
                {clips.slice(0, 15).map((clip) => (
                  <div
                    key={clip.id}
                    className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-lg"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {canPreview(clip) && (
                        <button
                          type="button"
                          onClick={() => setPreviewClip(clip)}
                          className="relative shrink-0 w-14 h-24 rounded-lg overflow-hidden bg-slate-800 group"
                          title="Preview clip"
                        >
                          {clip.thumbnailUrl ? (
                            <img
                              src={clip.thumbnailUrl}
                              alt=""
                              className="w-full h-full object-cover opacity-90 group-hover:opacity-70"
                            />
                          ) : (
                            <div className="w-full h-full bg-slate-700" />
                          )}
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="bg-white/90 rounded-full p-1.5 shadow">
                              <Play
                                size={16}
                                className="text-slate-900 ml-0.5"
                                fill="currentColor"
                              />
                            </span>
                          </span>
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900 truncate">
                          {clip.title}
                        </p>
                        <p className="text-sm text-slate-600">
                          {clip.duration}s · {clip.platform}
                        </p>
                        <ProgressBar clip={clip} />
                        <div className="mt-2 flex flex-wrap gap-2">
                          {canPreview(clip) && (
                            <button
                              type="button"
                              onClick={() => setPreviewClip(clip)}
                              className="text-xs font-medium text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                            >
                              <Play size={12} /> Preview
                            </button>
                          )}
                          {(clip.status === 'failed' ||
                            clip.status === 'draft') && (
                            <button
                              type="button"
                              disabled={retryingId === clip.id}
                              onClick={() => handleRetry(clip)}
                              className="text-xs font-medium text-amber-700 hover:text-amber-900 inline-flex items-center gap-1 disabled:opacity-50"
                            >
                              <RotateCcw
                                size={12}
                                className={
                                  retryingId === clip.id ? 'animate-spin' : ''
                                }
                              />
                              {retryingId === clip.id ? 'Retrying…' : 'Retry'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium capitalize shrink-0 ${
                        clip.status === 'ready'
                          ? 'bg-green-100 text-green-800'
                          : clip.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : clip.status === 'published'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {clip.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {previewClip && (
        <PreviewModal clip={previewClip} onClose={() => setPreviewClip(null)} />
      )}
    </div>
  );
}
