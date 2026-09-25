import React, { useEffect, useState } from 'react';
import { BarChart3, Film, Calendar, TrendingUp } from 'lucide-react';
import { useClipStore, Clip } from '../store/clipStore';
import api from '../lib/api';

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
        <p className="text-xs text-red-600 mb-1">{label}</p>
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

export function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalClips: 0,
    totalViews: 0,
    avgEngagement: 0,
    scheduledClips: 0,
  });
  const [loading, setLoading] = useState(true);
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

    // Live poll while any clip is processing
    const interval = setInterval(async () => {
      try {
        const clipsRes = await api.get('/api/clips');
        if (cancelled) return;
        const list = clipsRes.data.clips || [];
        setClips(Array.isArray(list) ? list : []);
      } catch {
        /* ignore poll errors */
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setClips]);

  const StatCard = ({
    icon: Icon,
    label,
    value,
    trend,
  }: {
    icon: any;
    label: string;
    value: string | number;
    trend?: string;
  }) => (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-600 text-sm font-medium">{label}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
          {trend && <p className="text-green-600 text-sm mt-2">{trend}</p>}
        </div>
        <div className="p-3 bg-blue-100 rounded-lg">
          <Icon className="text-blue-600" size={24} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-2">
          Welcome back! Here's your content overview.
        </p>
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
                {clips.slice(0, 12).map((clip) => (
                  <div
                    key={clip.id}
                    className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 truncate">
                        {clip.title}
                      </p>
                      <p className="text-sm text-slate-600">
                        {clip.duration}s · {clip.platform}
                      </p>
                      <ProgressBar clip={clip} />
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
    </div>
  );
}
