// ── Agent ──────────────────────────────────────────────────

export interface Agent {
  id: string;
  hostname: string;
  platform: string;
  arch: string;
  osVersion: string;
  cpuModel: string;
  cpuCores: number;
  totalMemory: number;
  gpuModel?: string;
  username: string;
  ip: string;
  status: 'online' | 'offline';
  connectedAt: string;
  disconnectedAt?: string;
  lastSeen: string;
  metrics: Metrics | null;
  group?: string;
  tags?: string[];
  latency?: number;
}

// ── Metrics ───────────────────────────────────────────────

export interface Metrics {
  cpu: {
    load: number;
    cores: { core: number; load: number }[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    available: number;
    usedPercent: number;
    swapTotal: number;
    swapUsed: number;
  };
  disk: {
    disks: DiskInfo[];
    totalSize: number;
    totalUsed: number;
    usedPercent: number;
  };
  network: {
    rxSec: number;
    txSec: number;
    interfaces: NetworkInterface[];
  };
  gpus?: GpuInfo[];
  uptime: number;
  timestamp: string;
}

export interface GpuInfo {
  name: string;
  vendor?: string;
  vram: number;
  vramUsed?: number;
  load: number;
  temperature: number;
  fanSpeed?: number;
  powerDraw?: number;
  memoryUsed?: number;
  memoryFree?: number;
  clockCore?: number;
  clockMemory?: number;
}

export interface DiskInfo {
  fs: string;
  mount: string;
  type: string;
  size: number;
  used: number;
  available: number;
  usedPercent: number;
}

export interface NetworkInterface {
  iface: string;
  rxSec: number;
  txSec: number;
  rxTotal: number;
  txTotal: number;
}

// ── Events ────────────────────────────────────────────────

export interface SystemEvent {
  id: string;
  type: string;
  message: string;
  agentId: string | null;
  actor?: string | null;
  timestamp: string;
}

// ── Command ───────────────────────────────────────────────

export interface CommandResult {
  agentId: string;
  success: boolean;
  stdout: string;
  stderr: string;
  command: string;
  code?: number;
  error?: string;
}

// ── File System ───────────────────────────────────────────

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string | null;
  created: string | null;
  error?: string;
}

export interface FileListResult {
  success: boolean;
  path: string;
  parentPath: string;
  files: FileItem[];
  error?: string;
}

// ── Services ──────────────────────────────────────────────

export interface ServiceItem {
  name: string;
  displayName: string;
  status: string;
  startType: string;
}

// ── Chat ──────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  sender: 'admin' | 'agent';
  senderName: string;
  text: string;
  timestamp: string;
  agentId: string;
}

// ── File Transfer ─────────────────────────────────────────

export interface FileTransferItem {
  id: string;
  fileName: string;
  fileSize: number;
  direction: 'upload' | 'download';
  status: 'pending' | 'transferring' | 'completed' | 'failed';
  progress: number;
  speed: number;
  agentId: string;
  localPath?: string;
  remotePath?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

// ── Alerts ────────────────────────────────────────────────

export interface AlertRule {
  id: string;
  name: string;
  metric: 'cpu' | 'ram' | 'disk';
  operator: 'gt' | 'lt';
  threshold: number;
  duration: number; // seconds the condition must persist
  enabled: boolean;
  agentId?: string; // null = all agents
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  agentId: string;
  agentHostname: string;
  metric: string;
  currentValue: number;
  threshold: number;
  message: string;
  severity: 'warning' | 'critical';
  timestamp: string;
  acknowledged: boolean;
}

// ── Connection Quality ────────────────────────────────────

export interface ConnectionQuality {
  latency: number;
  fps: number;
  bandwidth: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}
