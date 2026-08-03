import React, { useEffect, useState } from 'react';
import { BarChart3, Film, Calendar, TrendingUp } from 'lucide-react';
import { useClipStore } from '../store/clipStore';
import api from '../lib/api';

interface Stats {
  totalClips: number;
  totalViews: number;
  avgEngagement: number;
  scheduledClips: number;
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
    const fetchData = async () => {
      try {
        const [statsRes, clipsRes] = await Promise.all([
          api.get('/api/analytics/overview'),
          api.get('/api/clips'),
        ]);
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
        setLoading(false);
      }
    };

    fetchData();
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
                {clips.slice(0, 8).map((clip) => (
                  <div
                    key={clip.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{clip.title}</p>
                      <p className="text-sm text-slate-600">
                        {clip.duration}s · {clip.platform}
                      </p>
                    </div>
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium capitalize">
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
