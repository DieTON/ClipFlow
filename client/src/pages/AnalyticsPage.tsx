import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Eye, ThumbsUp } from 'lucide-react';
import api from '../lib/api';

interface ClipAnalytics {
  clipId: string;
  title: string;
  views: number;
  likes: number;
  shares: number;
  engagement: number;
}

export function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<ClipAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await api.get('/api/analytics/clips');
        setAnalytics(response.data);
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  const totalViews = analytics.reduce((sum, a) => sum + a.views, 0);
  const totalLikes = analytics.reduce((sum, a) => sum + a.likes, 0);
  const avgEngagement = analytics.length > 0
    ? (analytics.reduce((sum, a) => sum + a.engagement, 0) / analytics.length).toFixed(1)
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Analytics</h1>
        <p className="text-slate-600 mt-2">Track your content performance across all platforms</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">Total Views</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">
                {totalViews.toLocaleString()}
              </p>
            </div>
            <Eye className="text-blue-600" size={32} />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">Total Likes</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">
                {totalLikes.toLocaleString()}
              </p>
            </div>
            <ThumbsUp className="text-green-600" size={32} />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600 text-sm font-medium">Avg Engagement</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{avgEngagement}%</p>
            </div>
            <TrendingUp className="text-orange-600" size={32} />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          <BarChart3 size={24} />
          Clip Performance
        </h2>

        {loading ? (
          <p className="text-slate-600 text-center py-8">Loading analytics...</p>
        ) : analytics.length === 0 ? (
          <p className="text-slate-600 text-center py-8">No analytics data yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-900">Clip Title</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-900">Views</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-900">Likes</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-900">Shares</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-900">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {analytics.map((clip) => (
                  <tr key={clip.clipId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-900">{clip.title}</td>
                    <td className="text-right py-3 px-4 text-slate-600">
                      {clip.views.toLocaleString()}
                    </td>
                    <td className="text-right py-3 px-4 text-slate-600">
                      {clip.likes.toLocaleString()}
                    </td>
                    <td className="text-right py-3 px-4 text-slate-600">
                      {clip.shares.toLocaleString()}
                    </td>
                    <td className="text-right py-3 px-4">
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                        {clip.engagement.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
