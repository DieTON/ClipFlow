import { create } from 'zustand';

interface Clip {
  id: string;
  videoId: string;
  title: string;
  description?: string;
  startSeconds: number;
  duration: number;
  platform: string;
  status: string;
  createdAt: string;
}

interface ClipStore {
  clips: Clip[];
  loading: boolean;
  setClips: (clips: Clip[]) => void;
  addClip: (clip: Clip) => void;
  removeClip: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useClipStore = create<ClipStore>((set) => ({
  clips: [],
  loading: false,

  setClips: (clips: Clip[]) => set({ clips }),

  addClip: (clip: Clip) =>
    set((state) => ({ clips: [clip, ...state.clips] })),

  removeClip: (id: string) =>
    set((state) => ({ clips: state.clips.filter((c) => c.id !== id) })),

  setLoading: (loading: boolean) => set({ loading }),
}));
