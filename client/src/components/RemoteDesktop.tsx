import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../api/socket';
import { useVncSocket } from '../hooks/useVncSocket';
import type { MonitorInfo, VncStats } from '../hooks/useVncSocket';
import {
  Tv,
  Play,
  Square,
  Maximize,
  Minimize,
  Monitor,
  MousePointer,
  Clipboard,
  ClipboardPaste,
  Wifi,
  WifiOff,
  MonitorSmartphone,
  Camera,
  Video,
  VideoOff,
  Zap
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface RemoteDesktopProps {
  agentId: string;
}

export default function RemoteDesktop({ agentId }: RemoteDesktopProps) {
  const { isDark } = useTheme();
  const [streaming, setStreaming] = useState(false);
  const [fps, setFps] = useState(5);
  const [quality, setQuality] = useState(30);
  const [inputEnabled, setInputEnabled] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [selectedMonitor, setSelectedMonitor] = useState(0);
  const [latency, setLatency] = useState(0);
  const [clipboardText, setClipboardText] = useState('');
  const [showClipboard, setShowClipboard] = useState(false);
  const [actualFps, setActualFps] = useState(0);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [showRemoteCursor, setShowRemoteCursor] = useState(true);
  const [smoothCursor, setSmoothCursor] = useState(true);
  const [autoHideLocalCursor, setAutoHideLocalCursor] = useState(false);
  const [showAdminCursor, setShowAdminCursor] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [vncStats, setVncStats] = useState<VncStats>({ bandwidth: 0, fps: 0, adaptiveQuality: 0 });
  const [vncConnected, setVncConnected] = useState(false);
  
  const targetCursorRef = useRef({ x: 0, y: 0 });
  const currentCursorRef = useRef({ x: 0, y: 0 });
  const adminCursorRef = useRef({ x: 0, y: 0, visible: false });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const screenAreaRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  
  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const frameTimesRef = useRef<number[]>([]);
  const lastMouseMoveRef = useRef<number>(0);
  const mouseMoveThrottleRef = useRef<number>(16); // ~60fps for mouse movement
  const isMouseDownRef = useRef<boolean>(false);
  const mouseButtonRef = useRef<'left' | 'right'>('left');

  // VNC frame handler: decode binary JPEG blob via createImageBitmap (GPU-accelerated)
  const handleVncFrame = useCallback((blob: Blob) => {
    frameTimesRef.current.push(Date.now());
    createImageBitmap(blob).then((bitmap) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
      }
      // Store as ImageBitmap for the render loop
      if (imgRef.current && 'close' in imgRef.current) {
        (imgRef.current as unknown as ImageBitmap).close();
      }
      imgRef.current = bitmap as unknown as HTMLImageElement;
    }).catch(() => {
      // Fallback: decode via Image element
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (canvas.width !== img.width || canvas.height !== img.height) {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        imgRef.current = img;
        URL.revokeObjectURL(url);
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    });
  }, []);

  const handleVncCursor = useCallback((x: number, y: number) => {
    targetCursorRef.current = { x, y };
  }, []);

  const handleVncMonitors = useCallback((m: MonitorInfo[]) => {
    setMonitors(m);
  }, []);

  const handleVncStats = useCallback((s: VncStats) => {
    setVncStats(s);
  }, []);

  const handleAgentReady = useCallback(() => {
    setVncConnected(true);
  }, []);

  const handleAgentGone = useCallback(() => {
    setVncConnected(false);
  }, []);

  // VNC WebSocket hook
  const vnc = useVncSocket({
    agentId,
    onFrame: handleVncFrame,
    onCursor: handleVncCursor,
    onMonitors: handleVncMonitors,
    onStats: handleVncStats,
    onAgentReady: handleAgentReady,
    onAgentGone: handleAgentGone,
  });

  // Calculate actual FPS
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const times = frameTimesRef.current.filter((t) => now - t < 1000);
      frameTimesRef.current = times;
      setActualFps(times.length);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Shared label drawer — small rounded badge with text next to a cursor.
  const drawCursorLabel = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    bg: string,
    fg: string
  ) => {
    // Scale label to canvas resolution so it stays readable on hi-DPI streams.
    const scale = Math.max(1, ctx.canvas.width / 1024);
    const fontSize = Math.round(11 * scale);
    const padX = 6 * scale;
    const padY = 3 * scale;
    const offsetX = 14 * scale;
    const offsetY = 4 * scale;

    ctx.save();
    ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(text);
    const width = metrics.width + padX * 2;
    const height = fontSize + padY * 2;
    const bx = x + offsetX;
    const by = y - height / 2 + offsetY;

    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 4 * scale;
    ctx.fillStyle = bg;
    const radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(bx + radius, by);
    ctx.arcTo(bx + width, by, bx + width, by + height, radius);
    ctx.arcTo(bx + width, by + height, bx, by + height, radius);
    ctx.arcTo(bx, by + height, bx, by, radius);
    ctx.arcTo(bx, by, bx + width, by, radius);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.fillStyle = fg;
    ctx.fillText(text, bx + padX, by + height / 2);
    ctx.restore();
  };

  // Cyan cursor — represents the actual cursor on the remote PC.
  const drawRemoteCursor = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    if (!ctx || x === 0 || y === 0) return;

    const size = 12;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 255, 255, 0.6)';
    ctx.shadowBlur = 10;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent';
    ctx.restore();

    drawCursorLabel(ctx, x, y, 'PC', 'rgba(0, 200, 220, 0.92)', '#00121A');
  };

  // Orange arrow — represents where the admin (this dashboard) is pointing.
  const drawAdminCursor = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    if (!ctx) return;
    const scale = Math.max(1, ctx.canvas.width / 1024);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 6 * scale;

    // Standard arrow-cursor shape.
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 14 * scale, y + 14 * scale);
    ctx.lineTo(x + 6 * scale, y + 14 * scale);
    ctx.lineTo(x + 10 * scale, y + 22 * scale);
    ctx.lineTo(x + 6 * scale, y + 24 * scale);
    ctx.lineTo(x + 2 * scale, y + 16 * scale);
    ctx.lineTo(x - 4 * scale, y + 20 * scale);
    ctx.closePath();
    ctx.fillStyle = '#FF6B2C';
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 1.5 * scale;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    ctx.restore();

    drawCursorLabel(ctx, x, y, 'admin', 'rgba(255, 107, 44, 0.95)', '#1A0A00');
  };

  // Socket.IO listeners for latency and clipboard (not part of VNC stream)
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleLatency = (data: { agentId: string; latency: number }) => {
      if (data.agentId !== agentId) return;
      setLatency(data.latency);
    };

    const handleClipboard = (data: { agentId: string; text: string }) => {
      if (data.agentId !== agentId) return;
      setClipboardText(data.text);
    };

    socket.on('agent:latency', handleLatency);
    socket.on('clipboard:data', handleClipboard);

    // Request monitor list via VNC
    vnc.getMonitors();

    return () => {
      socket.off('agent:latency', handleLatency);
      socket.off('clipboard:data', handleClipboard);
    };
  }, [agentId, vnc]);

  // Render loop for smooth cursor interpolation and constant FPS drawing
  useEffect(() => {
    if (!streaming) return;
    let animationFrameId: number;

    const renderLoop = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const img = imgRef.current;

      if (canvas && ctx && img) {
        const dx = targetCursorRef.current.x - currentCursorRef.current.x;
        const dy = targetCursorRef.current.y - currentCursorRef.current.y;

        // If it's a huge jump (initial pos) or smooth is off, snap to target
        if (!smoothCursor || (currentCursorRef.current.x === 0 && currentCursorRef.current.y === 0)) {
          currentCursorRef.current.x = targetCursorRef.current.x;
          currentCursorRef.current.y = targetCursorRef.current.y;
        } else if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          // Lerp interpolation (approx 40% distance per frame)
          currentCursorRef.current.x += dx * 0.4;
          currentCursorRef.current.y += dy * 0.4;
        }

        // Always clear and draw image
        ctx.drawImage(img, 0, 0);

        // Draw remote cursor if enabled
        if (showRemoteCursor && (currentCursorRef.current.x !== 0 || currentCursorRef.current.y !== 0)) {
          drawRemoteCursor(ctx, currentCursorRef.current.x, currentCursorRef.current.y);
        }

        // Draw admin cursor (this dashboard) if enabled, while input is active.
        if (showAdminCursor && inputEnabled && adminCursorRef.current.visible) {
          drawAdminCursor(ctx, adminCursorRef.current.x, adminCursorRef.current.y);
        }
      }

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
    // drawRemoteCursor / drawAdminCursor are pure functions of their args (no captured mutable state)
    // — including them in deps would tear down the render loop on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, smoothCursor, showRemoteCursor, showAdminCursor, inputEnabled]);

  const startStreaming = () => {
    vnc.startStream(fps, quality, selectedMonitor);
    setStreaming(true);
    targetCursorRef.current = { x: 0, y: 0 };
    currentCursorRef.current = { x: 0, y: 0 };
    setTimeout(() => screenAreaRef.current?.focus(), 50);
  };

  const stopStreaming = () => {
    vnc.stopStream();
    setStreaming(false);
    targetCursorRef.current = { x: 0, y: 0 };
    currentCursorRef.current = { x: 0, y: 0 };
  };

  const emitMouseEvent = (x: number, y: number, type: 'move' | 'click' | 'dblclick' | 'wheel', button: 'left' | 'right' | 'scroll' = 'left', wheel?: number) => {
    vnc.sendMouse(x, y, type, button, wheel || 0);
  };

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    return { x, y };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!inputEnabled || !streaming) return;
    screenAreaRef.current?.focus();
    e.preventDefault();

    isMouseDownRef.current = true;
    const button = e.button === 2 ? 'right' : 'left';
    mouseButtonRef.current = button;

    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    emitMouseEvent(coords.x, coords.y, 'click', button);
  };

  const handleCanvasMouseUp = () => {
    if (!streaming) return;
    isMouseDownRef.current = false;
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!streaming) return;

    // Always update the local admin cursor position so the overlay tracks the
    // mouse smoothly, even if outbound 'move' events are throttled.
    const coords = getCanvasCoordinates(e);
    if (coords) {
      adminCursorRef.current = { x: coords.x, y: coords.y, visible: true };
    }

    // Throttle outbound mouse movement to reduce socket spam.
    const now = Date.now();
    if (now - lastMouseMoveRef.current < mouseMoveThrottleRef.current) return;
    lastMouseMoveRef.current = now;

    if (!coords) return;

    if (inputEnabled) {
      emitMouseEvent(coords.x, coords.y, 'move', 'left');
    }
  };

  const handleCanvasMouseEnter = () => {
    adminCursorRef.current = { ...adminCursorRef.current, visible: true };
  };

  const handleCanvasMouseLeave = () => {
    adminCursorRef.current = { ...adminCursorRef.current, visible: false };
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!inputEnabled || !streaming) return;
    e.preventDefault();
    
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    emitMouseEvent(coords.x, coords.y, 'dblclick', 'left');
  };

  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!inputEnabled || !streaming) return;
    e.preventDefault();

    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    emitMouseEvent(coords.x, coords.y, 'click', 'right');
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!inputEnabled || !streaming) return;
    e.preventDefault();

    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    const wheelDelta = e.deltaY > 0 ? -3 : 3; // Negative for scroll down, positive for scroll up
    emitMouseEvent(coords.x, coords.y, 'wheel', 'scroll', wheelDelta);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!inputEnabled || !streaming) return;
    e.preventDefault();
    vnc.sendKeyboard(e.key, 'press');
  };

  const sendSpecialKey = (key: string) => {
    if (!inputEnabled || !streaming) return;
    vnc.sendKeyboard(key, 'press');
    screenAreaRef.current?.focus();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!fullscreen) {
      containerRef.current.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  };

  const takeScreenshot = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `nexus-screenshot-${new Date().getTime()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const toggleRecording = () => {
    if (!canvasRef.current) return;

    if (isRecording) {
      mediaRecorderRef.current?.stop();
    } else {
      try {
        recordedChunksRef.current = [];
        // Capture canvas stream (30 FPS)
        const stream = canvasRef.current.captureStream(30);
        
        // Try to use a widely supported codec
        let options = { mimeType: 'video/webm' };
        if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
          options = { mimeType: 'video/webm; codecs=vp9' };
        } else if (MediaRecorder.isTypeSupported('video/mp4')) {
           options = { mimeType: 'video/mp4' };
        }

        const recorder = new MediaRecorder(stream, options);
        
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };
        
        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: options.mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          const ext = options.mimeType.includes('mp4') ? 'mp4' : 'webm';
          a.download = `nexus-record-${new Date().getTime()}.${ext}`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
          setIsRecording(false);
        };
        
        recorder.start(1000); // Collect data every second to ensure data flow
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
      } catch (e) {
        console.error("Screen recording is not supported:", e);
        setIsRecording(false);
      }
    }
  };

  const requestClipboard = () => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('clipboard:request', { agentId });
    setShowClipboard(true);
  };

  const sendClipboard = () => {
    const socket = getSocket();
    if (!socket || !clipboardText) return;
    socket.emit('clipboard:send', { agentId, text: clipboardText });
  };

  const getConnectionQuality = (): { label: string; color: string } => {
    if (latency === 0) return { label: 'N/A', color: 'text-slate-500' };
    if (latency < 50) return { label: 'Excellent', color: 'text-emerald-400' };
    if (latency < 100) return { label: 'Good', color: 'text-blue-400' };
    if (latency < 200) return { label: 'Fair', color: 'text-yellow-400' };
    return { label: 'Poor', color: 'text-red-400' };
  };

  const connQuality = getConnectionQuality();

  const toolbarBtnClass = "h-10 w-10 rounded-lg flex items-center justify-center transition-all duration-200";

  return (
    <div ref={containerRef} className={`${isDark ? 'bg-[#0B0C10] border-[#1e232b]' : 'bg-gray-50 border-gray-200'} border rounded-2xl overflow-hidden shadow-xl flex flex-col`}>
      {/* Sleek Header Section */}
      <div className={`flex flex-col md:flex-row items-start md:items-center justify-between gap-3 px-4 py-3 border-b ${isDark ? 'border-[#1e232b] bg-[#12141A]' : 'border-gray-200 bg-white'}`}>
        
        {/* Left: Branding & Status */}
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-9 h-9 rounded-xl ${isDark ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
              <Tv className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <h3 className={`text-sm font-semibold leading-none ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>Remote Console</h3>
              <div className="flex items-center gap-1.5 mt-1.5">
                 <span className="flex h-2 w-2 relative">
                   {streaming && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                   <span className={`relative inline-flex rounded-full h-2 w-2 ${streaming ? 'bg-emerald-500' : (isDark ? 'bg-slate-600' : 'bg-gray-300')}`}></span>
                 </span>
                 <span className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                   {streaming ? 'VNC Live' : vncConnected ? 'VNC Ready' : 'Disconnected'}
                 </span>
              </div>
            </div>
          </div>
          
          {/* Mobile Connection Stats (only visible on sm, hidden on md) */}
          {streaming && (
            <div className="flex md:hidden items-center gap-2 text-xs">
              {latency > 0 ? <Wifi className={`w-4 h-4 ${connQuality.color}`} /> : <WifiOff className="w-4 h-4 text-slate-500" />}
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{actualFps}fps</span>
            </div>
          )}
        </div>

        {/* Right: Settings & Stats */}
        <div className="flex w-full md:w-auto items-center overflow-x-auto pb-1 md:pb-0 gap-3 no-scrollbar shrink-0">
          
          {/* Desktop Connection Stats */}
          {streaming && (
            <div className={`hidden md:flex items-center gap-3 px-3 py-1.5 rounded-lg border shrink-0 ${isDark ? 'bg-[#0B0C10] border-[#1e232b]' : 'bg-gray-50 border-gray-200'} text-xs`}>
              <div className="flex items-center gap-1.5" title="Latency">
                {latency > 0 ? <Wifi className={`w-3.5 h-3.5 ${connQuality.color}`} /> : <WifiOff className="w-3.5 h-3.5 text-slate-500" />}
                <span className={`${connQuality.color} font-medium tracking-wide`}>{latency}ms</span>
              </div>
              <div className={`w-px h-3 ${isDark ? 'bg-slate-800' : 'bg-gray-300'}`}></div>
              <div className="flex items-center gap-1.5" title="Actual FPS">
                <Monitor className={`w-3.5 h-3.5 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                <span className={`${isDark ? 'text-slate-300' : 'text-gray-600'} font-medium tracking-wide`}>{actualFps} FPS</span>
              </div>
              {vncStats.bandwidth > 0 && (
                <>
                  <div className={`w-px h-3 ${isDark ? 'bg-slate-800' : 'bg-gray-300'}`}></div>
                  <div className="flex items-center gap-1.5" title="VNC Bandwidth (per 2s)">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span className={`${isDark ? 'text-slate-300' : 'text-gray-600'} font-medium tracking-wide`}>{(vncStats.bandwidth / 1024).toFixed(0)} KB/s</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Quick Settings Pill */}
          <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg border shrink-0 transition-colors ${isDark ? 'bg-[#0B0C10] border-[#1e232b] hover:border-slate-700' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
            <div className="flex items-center gap-1.5 text-xs">
              <span className={`font-medium ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>FPS</span>
              <select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                disabled={streaming}
                className={`bg-transparent border-none focus:ring-0 cursor-pointer outline-none font-semibold p-0 leading-none ${isDark ? 'text-slate-200' : 'text-gray-700'}`}
              >
                <option value={2} className="bg-slate-800">2</option>
                <option value={5} className="bg-slate-800">5</option>
                <option value={10} className="bg-slate-800">10</option>
              </select>
            </div>

            <div className={`w-px h-3 ${isDark ? 'bg-slate-800' : 'bg-gray-200'}`}></div>
            
            <div className="flex items-center gap-1.5 text-xs">
              <span className={`font-medium ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Q</span>
              <select
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                disabled={streaming}
                className={`bg-transparent border-none focus:ring-0 cursor-pointer outline-none font-semibold p-0 leading-none ${isDark ? 'text-slate-200' : 'text-gray-700'}`}
              >
                <option value={20} className="bg-slate-800">Low</option>
                <option value={30} className="bg-slate-800">Med</option>
                <option value={50} className="bg-slate-800">High</option>
                <option value={70} className="bg-slate-800">Ultra</option>
              </select>
            </div>

            {monitors.length > 1 && (
              <>
                <div className={`w-px h-3 ${isDark ? 'bg-slate-800' : 'bg-gray-200'}`}></div>
                <div className="flex items-center gap-1.5 text-xs">
                  <MonitorSmartphone className={`w-3 h-3 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                  <select
                    value={selectedMonitor}
                    onChange={(e) => setSelectedMonitor(Number(e.target.value))}
                    disabled={streaming}
                    className={`bg-transparent border-none focus:ring-0 cursor-pointer outline-none font-semibold p-0 leading-none ${isDark ? 'text-slate-200' : 'text-gray-700'}`}
                  >
                    {monitors.map((m) => (
                      <option key={m.index} value={m.index} className="bg-slate-800">
                        {m.name || `Monitor ${m.index}`}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Toggles Group */}
          <div className={`hidden md:flex items-center gap-4 px-3 py-2 rounded-lg border shrink-0 ${isDark ? 'bg-[#0B0C10] border-[#1e232b]' : 'bg-gray-50 border-gray-200'}`}>
            <label className="flex items-center gap-1.5 cursor-pointer group">
              <input type="checkbox" checked={showRemoteCursor} onChange={e => setShowRemoteCursor(e.target.checked)} 
                className={`rounded border-slate-600 text-indigo-500 focus:ring-indigo-500/30 bg-transparent transition`} />
              <span className={`text-[11px] font-medium transition ${isDark ? 'text-slate-400 group-hover:text-slate-300' : 'text-gray-500 group-hover:text-gray-700'}`}>Server Cursor</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer group">
              <input type="checkbox" checked={smoothCursor} onChange={e => setSmoothCursor(e.target.checked)} 
                className={`rounded border-slate-600 text-indigo-500 focus:ring-indigo-500/30 bg-transparent transition`} />
              <span className={`text-[11px] font-medium transition ${isDark ? 'text-slate-400 group-hover:text-slate-300' : 'text-gray-500 group-hover:text-gray-700'}`}>Smooth</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer group">
              <input type="checkbox" checked={showAdminCursor} onChange={e => setShowAdminCursor(e.target.checked)}
                className={`rounded border-slate-600 text-orange-500 focus:ring-orange-500/30 bg-transparent transition`} />
              <span className={`text-[11px] font-medium transition ${isDark ? 'text-slate-400 group-hover:text-slate-300' : 'text-gray-500 group-hover:text-gray-700'}`}>My Cursor</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer group">
              <input type="checkbox" checked={autoHideLocalCursor} onChange={e => setAutoHideLocalCursor(e.target.checked)}
                className={`rounded border-slate-600 text-indigo-500 focus:ring-indigo-500/30 bg-transparent transition`} />
              <span className={`text-[11px] font-medium transition ${isDark ? 'text-slate-400 group-hover:text-slate-300' : 'text-gray-500 group-hover:text-gray-700'}`}>Hide Local</span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Screen Area */}
      <div
        ref={screenAreaRef}
        className="relative bg-[#000000] min-h-[350px] md:min-h-[500px] flex-1 focus:outline-none overflow-hidden"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Toggle Toolbar Button */}
        <button
          onClick={() => setToolbarOpen(!toolbarOpen)}
          className={`absolute left-0 top-1/2 -translate-y-1/2 z-30 h-16 w-4 rounded-r-xl border border-l-0 backdrop-blur-md bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center
            ${toolbarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          title="Show tools"
        >
          <div className="w-1 h-8 rounded-full bg-white/30" />
        </button>

        {/* Floating Glassmorphism Toolbar */}
        <div className={`absolute left-4 top-4 z-20 flex flex-col gap-2 p-2 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl transition-all duration-300 ${toolbarOpen ? 'translate-x-0 opacity-100' : '-translate-x-[150%] opacity-0 pointer-events-none'}`}>
          <button
            onClick={() => setToolbarOpen(false)}
            className="h-6 w-full flex items-center justify-center text-white/30 hover:text-white pb-1 mb-1 border-b border-white/10 transition-colors"
          >
            <Minimize className="w-3 h-3 rotate-45" />
          </button>

          <button
            onClick={streaming ? stopStreaming : startStreaming}
            className={`${toolbarBtnClass} ${streaming ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20' : 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'}`}
            title={streaming ? 'Stop Stream' : 'Start Stream'}
          >
            {streaming ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <button
            onClick={() => setInputEnabled(!inputEnabled)}
            className={`${toolbarBtnClass} ${inputEnabled ? 'text-indigo-400 bg-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'text-white/60 bg-white/5 hover:bg-white/10'}`}
            title={inputEnabled ? 'Input Active (Click to disable)' : 'Enable Input'}
          >
            <MousePointer className="w-4 h-4" />
          </button>

          <button
            onClick={requestClipboard}
            className={`${toolbarBtnClass} text-white/60 bg-white/5 hover:bg-white/10 hover:text-white`}
            title="Clipboard"
          >
            <Clipboard className="w-4 h-4" />
          </button>

          <button
            onClick={toggleFullscreen}
            className={`${toolbarBtnClass} text-white/60 bg-white/5 hover:bg-white/10 hover:text-white`}
            title="Fullscreen"
          >
            {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          <div className="w-full h-px bg-white/10 my-1"></div>

          <button
            onClick={takeScreenshot}
            disabled={!streaming}
            className={`${toolbarBtnClass} ${streaming ? 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20' : 'text-white/20'}`}
            title="Take Screenshot"
          >
            <Camera className="w-4 h-4" />
          </button>

          <button
            onClick={toggleRecording}
            disabled={!streaming}
            className={`${toolbarBtnClass} ${!streaming ? 'text-white/20' : isRecording ? 'text-red-500 bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse' : 'text-purple-400 bg-purple-500/10 hover:bg-purple-500/20'}`}
            title={isRecording ? 'Stop Recording' : 'Record Screen'}
          >
            {isRecording ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
          </button>
        </div>

        {/* Status Badges */}
        {streaming && (
          <div className="absolute right-4 top-4 z-20 pointer-events-none flex flex-col gap-2 items-end">
            <div className={`px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10 text-[10px] font-bold tracking-wider flex items-center gap-2 shadow-lg
              ${inputEnabled ? 'bg-indigo-500/20 text-indigo-200' : 'bg-black/40 text-white/50'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${inputEnabled ? 'bg-indigo-400 shadow-[0_0_5px_theme(colors.indigo.400)]' : 'bg-white/30'}`} />
              {inputEnabled ? 'INPUT ACTIVE' : 'VIEW ONLY'}
            </div>
            
            {isRecording && (
              <div className="px-3 py-1.5 rounded-full backdrop-blur-md border border-red-500/30 bg-red-500/20 text-red-200 text-[10px] font-bold tracking-wider flex items-center gap-2 shadow-lg animate-pulse">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_theme(colors.red.500)]" />
                REC
              </div>
            )}
          </div>
        )}

        {/* Render Canvas */}
        <div className="h-full w-full min-h-[350px] md:min-h-[500px] flex items-center justify-center p-2 sm:p-8">
          {streaming ? (
              <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseUp={handleCanvasMouseUp}
              onMouseMove={handleCanvasMouseMove}
              onMouseEnter={handleCanvasMouseEnter}
              onMouseLeave={handleCanvasMouseLeave}
              onDoubleClick={handleCanvasDoubleClick}
              onContextMenu={handleCanvasContextMenu}
              onWheel={handleCanvasWheel}
              className={`max-w-full max-h-full object-contain shadow-2xl ${
                inputEnabled
                  ? (showAdminCursor || autoHideLocalCursor ? 'cursor-none' : 'cursor-crosshair')
                  : 'cursor-default'
              }`}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-10 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-sm max-w-sm w-full mx-auto shadow-2xl">
              <div className="w-20 h-20 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6">
                <Monitor className="w-10 h-10 text-indigo-400" />
              </div>
              <h2 className="text-white text-xl font-bold mb-2">{vncConnected ? 'VNC Ready' : 'Waiting for Agent'}</h2>
              <p className="text-white/40 text-sm mb-8">{vncConnected ? 'Binary VNC channel active — press Connect to start streaming' : 'Agent VNC WebSocket not connected yet'}</p>
              
              <button
                onClick={startStreaming}
                className="w-full relative group overflow-hidden rounded-xl bg-indigo-500 hover:bg-indigo-600 transition-colors"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="absolute inset-0    group-hover:block" />
                <div className="px-6 py-3.5 flex items-center justify-center gap-2 text-white font-medium relative z-10">
                  <Play className="w-5 h-5 fill-current" />
                  Connect Now
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Floating Special Keys Bar */}
        {streaming && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-2 md:bottom-6 w-[95%] max-w-md z-20 flex items-center overflow-x-auto no-scrollbar gap-1.5 p-1.5 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl opacity-30 hover:opacity-100 transition-opacity duration-300">
            {[
              { label: 'Esc', key: 'Escape' },
              { label: 'Ctrl+Alt+Del', key: '^%{DEL}', special: true },
              { label: 'F1', key: 'F1' },
              { label: 'F5', key: 'F5' },
              { label: 'Enter', key: 'Enter' }
            ].map(k => (
              <button
                key={k.label}
                onClick={() => sendSpecialKey(k.key)}
                disabled={!inputEnabled}
                className={`flex-1 shrink-0 whitespace-nowrap px-3 py-1.5 text-[11px] md:text-xs font-semibold rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent
                  ${k.special ? 'text-red-300/80 hover:text-red-300 hover:bg-red-500/10' : ''}`}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Clipboard Panel */}
      {showClipboard && (
        <div className={`p-3 border-t ${isDark ? 'border-slate-700 bg-slate-900/95' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center gap-2 mb-2">
            <ClipboardPaste className="w-4 h-4 text-blue-400" />
            <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'} font-medium`}>Clipboard Sync</span>
            <button
              onClick={() => setShowClipboard(false)}
              className={`ml-auto text-xs ${isDark ? 'text-slate-500 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}
            >
              Close
            </button>
          </div>
          <textarea
            value={clipboardText}
            onChange={(e) => setClipboardText(e.target.value)}
            rows={3}
            className={`w-full ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'} border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500`}
            placeholder="Remote clipboard content will appear here..."
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={requestClipboard}
              className={`flex items-center gap-1 px-3 py-1 ${isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'} text-xs rounded transition`}
            >
              <Clipboard className="w-3 h-3" />
              Get Remote
            </button>
            <button
              onClick={sendClipboard}
              className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition"
            >
              <ClipboardPaste className="w-3 h-3" />
              Send to Remote
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(clipboardText);
                } catch { /* noop */ }
              }}
              className={`flex items-center gap-1 px-3 py-1 ${isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'} text-xs rounded transition`}
            >
              Copy Local
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
