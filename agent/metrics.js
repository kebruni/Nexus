const si = require('systeminformation');
const os = require('os');
const { execSync } = require('child_process');

let gpuCache = null;
let gpuCacheAt = 0;
const GPU_CACHE_TTL = 30000;

/**
 * Try to get NVIDIA GPU data via nvidia-smi (more accurate than systeminformation)
 */
function getNvidiaSmiData() {
  try {
    const output = execSync(
      'nvidia-smi --query-gpu=name,utilization.gpu,temperature.gpu,memory.total,memory.used,memory.free,fan.speed,power.draw --format=csv,noheader,nounits',
      { timeout: 5000, encoding: 'utf8', windowsHide: true }
    );
    return output.trim().split('\n').map(line => {
      const parts = line.split(',').map(s => s.trim());
      return {
        name: parts[0] || 'NVIDIA GPU',
        load: parseFloat(parts[1]) || 0,
        temperature: parseFloat(parts[2]) || 0,
        vramTotal: parseFloat(parts[3]) || 0,
        vramUsed: parseFloat(parts[4]) || 0,
        vramFree: parseFloat(parts[5]) || 0,
        fanSpeed: parts[6] && !parts[6].includes('N/A') ? parseFloat(parts[6]) || 0 : 0,
        powerDraw: parts[7] && !parts[7].includes('N/A') ? parseFloat(parts[7]) || 0 : 0,
      };
    });
  } catch {
    return null;
  }
}

/**
 * Try to get GPU engine usage via PowerShell (works for AMD & NVIDIA on Windows)
 */
function getWindowsGpuCounters() {
  if (os.platform() !== 'win32') return null;
  try {
    const script = [
      '$counters = (Get-Counter "\\GPU Engine(*)\\Utilization Percentage" -ErrorAction SilentlyContinue).CounterSamples | Where-Object { $_.CookedValue -gt 0 }',
      '$total = 0',
      'foreach ($c in $counters) {',
      '  if ($c.InstanceName -match "engtype_(3D|Graphics|Compute|Copy)") {',
      '    $total += $c.CookedValue',
      '  }',
      '}',
      'Write-Output ([math]::Round($total, 1))',
    ].join('\n');

    const output = execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${script.replace(/\n/g, ';')}"`,
      { timeout: 8000, encoding: 'utf8', windowsHide: true }
    );
    const totalLoad = parseFloat(output.trim()) || 0;
    return { TotalLoad: totalLoad };
  } catch {
    return null;
  }
}

async function loadGpuData() {
  const graphics = await si.graphics().catch(() => ({ controllers: [] }));

  let gpus = graphics && graphics.controllers ? graphics.controllers.map(g => ({
    name: g.model || 'Unknown GPU',
    vendor: g.vendor || '',
    vram: g.vram || 0,
    vramUsed: 0,
    load: g.utilizationGpu || 0,
    temperature: g.temperatureGpu || 0,
    fanSpeed: g.fanSpeed || 0,
    powerDraw: g.powerDraw || 0,
    memoryUsed: g.memoryUsed || 0,
    memoryFree: g.memoryFree || 0,
    clockCore: g.clockCore || 0,
    clockMemory: g.clockMemory || 0,
  })) : [];

  const nvidiaSmi = getNvidiaSmiData();
  if (nvidiaSmi && nvidiaSmi.length > 0) {
    for (const nv of nvidiaSmi) {
      const match = gpus.find(g =>
        g.name.toLowerCase().includes('nvidia') ||
        g.name.toLowerCase().includes(nv.name.toLowerCase().replace('nvidia ', '').split(' ')[0])
      );
      if (match) {
        match.load = nv.load;
        match.temperature = nv.temperature;
        match.vram = nv.vramTotal;
        match.vramUsed = nv.vramUsed;
        match.fanSpeed = nv.fanSpeed;
        match.powerDraw = nv.powerDraw;
      } else {
        gpus.push({
          name: nv.name,
          vendor: 'NVIDIA',
          vram: nv.vramTotal,
          vramUsed: nv.vramUsed,
          load: nv.load,
          temperature: nv.temperature,
          fanSpeed: nv.fanSpeed,
          powerDraw: nv.powerDraw,
          memoryUsed: nv.vramUsed * 1024 * 1024,
          memoryFree: nv.vramFree * 1024 * 1024,
          clockCore: 0,
          clockMemory: 0,
        });
      }
    }
  }

  if (os.platform() === 'win32') {
    const hasZeroLoadGpu = gpus.some(g => g.load === 0 && !g.name.toLowerCase().includes('nvidia'));
    if (hasZeroLoadGpu) {
      const winCounters = getWindowsGpuCounters();
      if (winCounters && winCounters.TotalLoad > 0) {
        const nvidiaLoad = nvidiaSmi ? nvidiaSmi.reduce((sum, n) => sum + n.load, 0) : 0;
        const remainingLoad = Math.max(0, winCounters.TotalLoad - nvidiaLoad);
        const zeroLoadGpus = gpus.filter(g => g.load === 0 && !g.name.toLowerCase().includes('nvidia'));
        if (zeroLoadGpus.length > 0) {
          const perGpu = remainingLoad / zeroLoadGpus.length;
          zeroLoadGpus.forEach(g => {
            g.load = Math.round(perGpu * 10) / 10;
          });
        }
      }
    }
  }

  return gpus;
}

async function getGpuDataCached() {
  const now = Date.now();
  if (gpuCache && now - gpuCacheAt < GPU_CACHE_TTL) {
    return gpuCache;
  }

  try {
    const gpus = await loadGpuData();
    gpuCache = gpus;
    gpuCacheAt = now;
    return gpus;
  } catch {
    return gpuCache || [];
  }
}

/**
 * Collect static system information (sent once on connect)
 */
async function getSystemInfo() {
  const [cpu, osInfo, mem, networkInterfaces] = await Promise.all([
    si.cpu(),
    si.osInfo(),
    si.mem(),
    si.networkInterfaces(),
  ]);

  // Find primary network interface IP
  const nets = Array.isArray(networkInterfaces) ? networkInterfaces : [networkInterfaces];
  const primaryNet = nets.find((n) => !n.internal && n.ip4) || nets[0];

  return {
    hostname: os.hostname(),
    platform: osInfo.platform,
    arch: osInfo.arch,
    osVersion: `${osInfo.distro} ${osInfo.release}`,
    cpuModel: cpu.manufacturer + ' ' + cpu.brand,
    cpuCores: cpu.cores,
    totalMemory: mem.total,
    gpuModel: 'N/A',
    username: os.userInfo().username,
    ip: primaryNet ? primaryNet.ip4 : '0.0.0.0',
  };
}

/**
 * Collect real-time metrics (called periodically)
 */
async function collectMetrics() {
  const [cpuLoad, mem, fsSize, networkStats] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.networkStats(),
  ]);

  // Extract GPU info from systeminformation
  const gpus = await getGpuDataCached();

  // Aggregate network stats
  const totalNetRx = networkStats.reduce((sum, n) => sum + (n.rx_sec || 0), 0);
  const totalNetTx = networkStats.reduce((sum, n) => sum + (n.tx_sec || 0), 0);

  // Disk info
  const disks = fsSize.map((d) => ({
    fs: d.fs,
    mount: d.mount,
    type: d.type,
    size: d.size,
    used: d.used,
    available: d.available,
    usedPercent: d.use,
  }));

  // Per-core CPU load
  const cpuCores = cpuLoad.cpus
    ? cpuLoad.cpus.map((c, i) => ({ core: i, load: Math.round(c.load * 100) / 100 }))
    : [];

  return {
    cpu: {
      load: Math.round(cpuLoad.currentLoad * 100) / 100,
      cores: cpuCores,
    },
    memory: {
      total: mem.total,
      used: mem.used,
      free: mem.free,
      available: mem.available,
      usedPercent: Math.round((mem.used / mem.total) * 10000) / 100,
      swapTotal: mem.swaptotal,
      swapUsed: mem.swapused,
    },
    disk: {
      disks,
      totalSize: disks.reduce((s, d) => s + d.size, 0),
      totalUsed: disks.reduce((s, d) => s + d.used, 0),
      usedPercent:
        disks.length > 0
          ? Math.round(
              (disks.reduce((s, d) => s + d.used, 0) / disks.reduce((s, d) => s + d.size, 0)) *
                10000
            ) / 100
          : 0,
    },
    network: {
      rxSec: Math.round(totalNetRx),
      txSec: Math.round(totalNetTx),
      interfaces: networkStats.map((n) => ({
        iface: n.iface,
        rxSec: Math.round(n.rx_sec || 0),
        txSec: Math.round(n.tx_sec || 0),
        rxTotal: n.rx_bytes,
        txTotal: n.tx_bytes,
      })),
    },
    gpus,
    uptime: os.uptime(),
    timestamp: new Date().toISOString(),
  };
}

module.exports = { getSystemInfo, collectMetrics };
