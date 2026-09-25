import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger.js';

interface SrtCue {
  start: number;
  end: number;
  text: string;
}

const HOOK_WORDS = [
  'wait',
  'what',
  'never',
  'secret',
  'actually',
  'insane',
  'crazy',
  'shock',
  'shocked',
  'amazing',
  'unbelievable',
  'honestly',
  'literally',
  'finally',
  'biggest',
  'worst',
  'best',
  'mistake',
  'warning',
  'stop',
  'don\'t',
  'cannot',
  'won\'t',
  'believe',
  'truth',
  'reveal',
  'revealed',
  'story',
  'happened',
  'suddenly',
  'omg',
  'holy',
  'bro',
  'guys',
  'listen',
  'watch',
  'look',
  'here',
  'money',
  'free',
  'win',
  'lost',
  'die',
  'death',
  'love',
  'hate',
  'fight',
  'scream',
];

function parseTimestamp(ts: string): number {
  const norm = ts.trim().replace(',', '.');
  const parts = norm.split(':');
  if (parts.length === 3) {
    return (
      parseFloat(parts[0]) * 3600 +
      parseFloat(parts[1]) * 60 +
      parseFloat(parts[2])
    );
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(norm) || 0;
}

export function parseSrtContent(content: string): SrtCue[] {
  const blocks = content.replace(/\r\n/g, '\n').split(/\n\n+/);
  const cues: SrtCue[] = [];
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split('-->').map((x) => x.trim());
    const text = lines
      .slice(lines.indexOf(timeLine) + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    cues.push({
      start: parseTimestamp(startRaw),
      end: parseTimestamp(endRaw),
      text,
    });
  }
  return cues;
}

function scoreCue(text: string): number {
  const lower = text.toLowerCase();
  let score = 0.4;
  for (const w of HOOK_WORDS) {
    if (lower.includes(w)) score += 0.08;
  }
  if (text.includes('?')) score += 0.12;
  if (text.includes('!')) score += 0.1;
  if (/\d/.test(text)) score += 0.05;
  if (text.length > 20 && text.length < 120) score += 0.05;
  return Math.min(0.99, score);
}

function formatTime(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Build clip windows from high-scoring transcript moments */
export function suggestionsFromTranscript(
  cues: SrtCue[],
  totalSeconds: number,
  platforms: string[],
  goal: string,
) {
  if (!cues.length || totalSeconds < 10) return null;

  const scored = cues
    .map((c) => ({ ...c, score: scoreCue(c.text) }))
    .filter((c) => c.score >= 0.55)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const clipDur = 35;
  const used: Array<{ start: number; end: number }> = [];
  const out: any[] = [];

  for (const cue of scored) {
    if (out.length >= 6) break;

    // Center window on the strong line
    let start = Math.max(0, Math.floor(cue.start - 5));
    let duration = Math.min(clipDur, Math.max(20, totalSeconds - start));
    if (start + duration > totalSeconds) {
      start = Math.max(0, totalSeconds - duration);
    }

    // Avoid overlapping suggestions
    const overlaps = used.some(
      (u) => start < u.end && start + duration > u.start,
    );
    if (overlaps) continue;

    used.push({ start, end: start + duration });

    const snippet = cue.text.slice(0, 80);
    out.push({
      id: uuid(),
      label: out.length === 0 ? 'Top hook' : `Moment ${out.length + 1}`,
      reason: `Transcript signal: “${snippet}${cue.text.length > 80 ? '…' : ''}”`,
      start: formatTime(start),
      end: formatTime(start + duration),
      startSeconds: start,
      duration,
      platform: platforms[out.length % platforms.length] || 'youtube',
      score: cue.score,
      hook: snippet,
      hashtags: `#${goal.replace(/\s/g, '')} #Shorts #Viral`,
      selected: true,
    });
  }

  return out.length >= 2 ? out : null;
}

/** Download auto-captions only (no video) for analysis */
export async function fetchYoutubeTranscript(
  videoId: string,
  workDir: string,
): Promise<SrtCue[] | null> {
  await fs.mkdir(workDir, { recursive: true });
  const outBase = path.join(workDir, `tx-${videoId}`);

  return new Promise((resolve) => {
    const args = [
      `https://www.youtube.com/watch?v=${videoId}`,
      '--skip-download',
      '--write-auto-sub',
      '--write-sub',
      '--sub-langs',
      'en.*,en,en-US,en-GB',
      '--convert-subs',
      'srt',
      '--sub-format',
      'srt/best',
      '-o',
      outBase,
      '--no-playlist',
      '--no-warnings',
      '--extractor-args',
      'youtube:player_client=android,web',
    ];

    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('error', () => resolve(null));
    proc.on('close', async () => {
      try {
        const files = await fs.readdir(workDir);
        const srt = files.find(
          (f) => f.includes(`tx-${videoId}`) && f.endsWith('.srt'),
        );
        if (!srt) {
          logger.warn(`No transcript for ${videoId}: ${stderr.slice(0, 150)}`);
          return resolve(null);
        }
        const content = await fs.readFile(path.join(workDir, srt), 'utf8');
        const cues = parseSrtContent(content);
        logger.info(`Transcript cues for ${videoId}: ${cues.length}`);
        resolve(cues.length ? cues : null);
      } catch {
        resolve(null);
      }
    });
  });
}
