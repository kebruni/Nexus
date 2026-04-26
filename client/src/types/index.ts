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
  lastSeen: string;
  disconnectedAt?: string;
  metrics: Metrics | null;
}

export interface CpuCore {
  core: number;
  load: number;
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

export interface Metrics {
  cpu: {
    load: number;
    cores: CpuCore[];
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

export interface MetricsHistoryItem extends Metrics {
  timestamp: string;
}

export interface SystemEvent {
  id: string;
  type: string;
  message: string;
  agentId: string | null;
  timestamp: string;
}

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

export interface ServiceItem {
  name: string;
  displayName: string;
  status: string;
  startType: string;
}

export interface CommandResult {
  agentId: string;
  success: boolean;
  stdout: string;
  stderr: string;
  command: string;
  requestId?: string;
  code?: number;
}
