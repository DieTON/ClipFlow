import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Send, Loader } from 'lucide-react';
import { useClipStore } from '../store/clipStore';
import api from '../lib/api';
import toast from 'react-hot-toast';

interface ScheduledClip {
  clipId: string;
  platform: string;
  scheduledTime: string;
}

export function SchedulePage() {
  const clips = useClipStore((s) => s.clips);
  const [scheduled, setScheduled] = useState<ScheduledClip[]>([]);
  const [selectedClip, setSelectedClip] = useState<string>('');
  const [platform, setPlatform] = useState('youtube');
  const [scheduledTime, setScheduledTime] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchScheduled = async () => {
      try {
        const response = await api.get('/api/schedule');
        setScheduled(response.data);
      } catch (error) {
        console.error('Failed to fetch scheduled clips:', error);
      }
    };
    fetchScheduled();
  }, []);

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClip || !scheduledTime) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/schedule', {
        clipId: selectedClip,
        platform,
        scheduledTime,
      });
      setScheduled([...scheduled, { clipId: selectedClip, platform, scheduledTime }]);
      setSelectedClip('');
      setScheduledTime('');
      toast.success('Clip scheduled successfully!');
    } catch (error) {
      toast.error('Failed to schedule clip');
      console.error('Schedule failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Schedule Clips</h1>
        <p className="text-slate-600 mt-2">Plan your content distribution across platforms</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <form onSubmit={handleSchedule} className="card space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Schedule New Clip</h2>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Select Clip
              </label>
              <select
                value={selectedClip}
                onChange={(e) => setSelectedClip(e.target.value)}
                className="input"
              >
                <option value="">Choose a clip...</option>
                {clips.map((clip) => (
                  <option key={clip.id} value={clip.id}>
                    {clip.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="input"
              >
                <option value="youtube">YouTube Shorts</option>
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram Reels</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Schedule Time
              </label>
              <input
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="input"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <Loader size={20} className="animate-spin" />
              ) : (
                <Send size={20} />
              )}
              {loading ? 'Scheduling...' : 'Schedule'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Scheduled Clips</h2>
            {scheduled.length === 0 ? (
              <p className="text-slate-600 text-center py-8">No scheduled clips yet</p>
            ) : (
              <div className="space-y-3">
                {scheduled.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Calendar className="text-blue-600" size={20} />
                      <div>
                        <p className="font-medium text-slate-900">Clip #{item.clipId}</p>
                        <p className="text-sm text-slate-600">{item.platform}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Clock size={18} />
                      <span className="text-sm">
                        {new Date(item.scheduledTime).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
