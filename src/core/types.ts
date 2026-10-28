export type MediaKind = 'direct' | 'hls' | 'dash' | 'page';
export interface Candidate {
  id: string;
  url: string;
  title: string;
  kind: MediaKind;
  tabId?: number;
  pageUrl?: string;
  poster?: string;
  duration?: number;
  size?: number;
  source: 'page' | 'network' | 'url';
  detectedAt: number;
}
export interface Segment {
  url: string;
  range?: { offset: number; length: number };
}
export interface Stream {
  id: string;
  label: string;
  url: string;
  bandwidth?: number;
  width?: number;
  height?: number;
  codecs?: string;
  mime?: string;
  segments?: Segment[];
  init?: Segment;
  live?: boolean;
  blocked?: string;
  container?: 'ts' | 'mp4' | 'webm';
}
export interface Analysis {
  candidate: Candidate;
  streams: Stream[];
  note?: string;
}
export type JobStatus =
  'queued' | 'running' | 'paused' | 'interrupted' | 'complete' | 'failed' | 'cancelled';
export interface Job {
  id: string;
  candidate: Candidate;
  stream?: Stream;
  filename: string;
  status: JobStatus;
  progress: number;
  bytes: number;
  completedSegments: number;
  totalSegments: number;
  createdAt: number;
  updatedAt: number;
  downloadId?: number;
  error?: string;
}
export interface Snapshot {
  candidates: Candidate[];
  jobs: Job[];
}
export type Request =
  | { type: 'snapshot' }
  | { type: 'scan'; tabId: number }
  | { type: 'detected'; candidates: Candidate[] }
  | { type: 'analyze'; url: string; title?: string }
  | { type: 'download'; candidate: Candidate; stream?: Stream }
  | { type: 'control'; id: string; action: 'pause' | 'resume' | 'cancel' | 'retry' }
  | { type: 'clear'; target: 'candidates' | 'history' }
  | { type: 'job-update'; job: Job }
  | { type: 'save-output'; jobId: string; url: string; filename: string };
