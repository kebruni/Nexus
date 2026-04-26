



  Folder,
  File,
  HardDrive,
  AlertCircle,
  Lock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Filter,
  ArrowRight,
  ArrowLeft,
  FileText,
  FileImage,
  FileArchive,
  FileCode,
  FileVideo,
  FileAudio,
  Monitor,
  ChevronDown,
  Check,
  X,
  Loader2,
  ArrowLeftRight,
  Server,
  FolderOpen, ArrowDownCircle,
} from 'lucide-react';

const API_BASE = 'http://localhost:3000/api';


/* ── helpers ── */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—';
  const k = 1024;
  const s = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + s[i];
}

function getFileKind(name: string, isDir: boolean): string {
  if (isDir) return 'folder';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ext || 'file';
}

function getFileIcon(name: string, isDir: boolean, hasError: boolean, size = 'w-[16px] h-[16px]') {
  if (hasError) return <Lock className={`${size} text-red-400/60`} />;
  if (isDir) return <Folder className={`${size} text-sky-400`} fill="currentColor" fillOpacity={0.15} />;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, React.ReactNode> = {
    img: <FileImage className={`${size} text-emerald-400/70`} />,
    code: <FileCode className={`${size} text-blue-400/70`} />,
    archive: <FileArchive className={`${size} text-amber-400/70`} />,
    video: <FileVideo className={`${size} text-purple-400/70`} />,
    audio: <FileAudio className={`${size} text-pink-400/70`} />,
    text: <FileText className={`${size} text-zinc-400/70`} />,
  };
  const imgExts = ['png','jpg','jpeg','gif','bmp','svg','ico','webp'];
  const codeExts = ['js','ts','tsx','jsx','py','java','cpp','c','h','cs','rs','go','rb','php','html','css','scss','json','xml','yaml','yml'];
  const archiveExts = ['zip','rar','7z','tar','gz'];
  const videoExts = ['mp4','avi','mkv','mov','wmv','webm'];
  const audioExts = ['mp3','wav','flac','ogg','aac'];
  if (imgExts.includes(ext)) return map.img;
  if (codeExts.includes(ext)) return map.code;
  if (archiveExts.includes(ext)) return map.archive;
  if (videoExts.includes(ext)) return map.video;
  if (audioExts.includes(ext)) return map.audio;
  if (['txt','log','md','pdf','doc','docx'].includes(ext)) return map.text;
  return <File className={`${size} text-zinc-500/70`} />;
}

/* ── types ── */
interface PanelState {
  path: string;
  files: FileItem[];
  parentPath: string;
  loading: boolean;
  error: string;
  selected: Set<string>;
  search: string;
  showSearch: boolean;
  handleStack?: FileSystemDirectoryHandle[];
  drives?: string[];
}

interface TransferJob {
  id: string;
  fileName: string;
  status: 'pending' | 'reading' | 'writing' | 'done' | 'error';
  size?: number;
  error?: string;
}

const defaultPanel: PanelState = {
  path: '',
  files: [],
  parentPath: '',
  loading: false,
  error: '',
  selected: new Set(),
  search: '',
  showSearch: false,
};

/* ══════════════════════════════════════════════════════════ */
 function FileTransfer() {
  const { isDark } = useTheme();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [local, setLocal] = useState<PanelState>({ ...defaultPanel });
  const [remote, setRemote] = useState<PanelState & { agentId: string | null }>({ ...defaultPanel, agentId: null });
  const [transfers, setTransfers] = useState<TransferJob[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  /* ── load local files via File System Access API ── */
  const loadFilesFromHandle = async (handle: FileSystemDirectoryHandle, stack: FileSystemDirectoryHandle[]) => {
    setLocal(p => ({ ...p, loading: true, error: '' }));
    try {
      const files: FileItem[] = [];
      
      // Request permission if not already granted
      // @ts-ignore
      if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') {
        // @ts-ignore
        const result = await handle.requestPermission({ mode: 'read' });
        if (result !== 'granted') {
          throw new Error('Доступ запрещен');
        }
      }

      // Read entries
      // @ts-ignore
      for await (const entry of handle.values()) {
        if (entry.kind === 'directory') {
          files.push({
            name: entry.name,
            path: entry.name,
            isDirectory: true,
            size: 0,
            modified: null,
            created: null
          });
        } else {
          try {
            const fileHandle = entry as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            files.push({
              name: entry.name,
              path: entry.name,
              isDirectory: false,
              size: file.size,
              modified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
              created: null
            });
          } catch(e) {
            files.push({
              name: entry.name,
              path: entry.name,
              isDirectory: false,
              size: 0,
              modified: null,
              created: null,
              error: 'read error'
            });
          }
        }
      }

      // Build path string for display
      const pathStr = stack.map(h => h.name).join('/');
      
      setLocal(p => ({
        ...p,
        files: files.sort((a, b) => {
          if (a.isDirectory === b.isDirectory) {
            return a.name.localeCompare(b.name);
          }
          return a.isDirectory ? -1 : 1;
        }),
        path: pathStr,
        parentPath: stack.length > 1 ? stack.slice(0, -1).map(h => h.name).join('/') : '',
        handleStack: stack,
        loading: false,
        selected: new Set()
      }));

    } catch (e: any) {
      setLocal(p => ({ ...p, loading: false, error: e.message }));
    }
  };

  const handleSelectRoot = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        throw new Error('Ваш браузер не поддерживает File System Access API. Используйте Chrome/Edge.');
      }
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      await loadFilesFromHandle(dirHandle, [dirHandle]);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setLocal(p => ({ ...p, error: e.message }));
      }
    }
  };

  const handleChangeRoot = async () => {
    await handleSelectRoot();
  };

  const navigateLocalDirectory = useCallback(async (dirName: string) => {
    if (!local.handleStack || local.handleStack.length === 0) return;
    
    try {
      const currentHandle = local.handleStack[local.handleStack.length - 1];
      const nextHandle = await currentHandle.getDirectoryHandle(dirName, { create: false });
      const newStack = [...local.handleStack, nextHandle];
      await loadFilesFromHandle(nextHandle, newStack);
    } catch (e: any) {
      setLocal(p => ({ ...p, error: `Failed to navigate: ${e.message}` }));
    }
  }, [local.handleStack]);

  const navigateLocalUp = useCallback(() => {
    if (!local.handleStack || local.handleStack.length <= 1) return;
    
    const newStack = local.handleStack.slice(0, -1);
    const currentHandle = newStack[newStack.length - 1];
    loadFilesFromHandle(currentHandle, newStack);
  }, [local.handleStack]);

  const refreshLocalDirectory = useCallback(() => {
    if (!local.handleStack || local.handleStack.length === 0) return;
    
    const currentHandle = local.handleStack[local.handleStack.length - 1];
    loadFilesFromHandle(currentHandle, local.handleStack);
  }, [local.handleStack]);

  /* ── agent list ── */
  useEffect(() => {
    const token = localStorage.getItem('pc-hub-token');
    if (token) {
      fetch(`${API_BASE}/agents`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then((list: Agent[]) => setAgents(list))
        .catch(() => {});
    }

    const socket = getSocket();
    if (!socket) return;
    socket.emit('agents:requestList');
    socket.on('agents:list', (list: Agent[]) => setAgents(list));
    socket.on('agent:metrics', ({ agentId, metrics }: any) => {
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, metrics, status: 'online' as const } : a));
    });
    return () => { socket.off('agents:list'); socket.off('agent:metrics'); };
  }, []);

  /* ── remote (agent) file list listener ── */
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (data: FileListResult & { agentId: string }) => {
      setRemote(prev => {
        if (prev.agentId !== data.agentId) return prev;
        if (data.success) {
          return { ...prev, files: data.files, path: data.path, parentPath: data.parentPath, loading: false, error: '', selected: new Set(), drives: (data as any).drives || prev.drives || [] };
        }
        return { ...prev, loading: false, error: data.error || 'Failed to list directory' };
      });
    };
    socket.on('file:list:result', handler);
    return () => { socket.off('file:list:result', handler); };
  }, []);

  /* ── transfer status listener ── */
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handleStatus = (data: any) => {
      setTransfers(prev => {
        const idx = prev.findIndex(t => t.id === data.transferId);
        if (idx === -1) return prev;
        const copy = [...prev];
        if (data.success !== undefined) {
          copy[idx] = { ...copy[idx], status: data.success ? 'done' : 'error', size: data.size, error: data.error };
        } else {
          copy[idx] = { ...copy[idx], status: data.status, size: data.size };
        }
        return copy;
      });

      // Refresh panels after successful transfer
      if (data.success) {
        setTimeout(() => {
          if (local.handleStack && local.handleStack.length > 0) {
            refreshLocalDirectory();
          }
          const s = getSocket();
          setRemote(p => {
            if (p.agentId && s) s.emit('file:list', { agentId: p.agentId, dirPath: p.path });
            return p;
          });
        }, 300);
      }
    };
    socket.on('file:transfer:status', handleStatus);
    return () => { socket.off('file:transfer:status', handleStatus); };
  }, [local.handleStack, refreshLocalDirectory]);

  /* ── navigate remote (agent) ── */
  const navigateRemote = useCallback((dirPath: string, agentIdOverride?: string) => {
    setRemote(prev => {
      const aid = agentIdOverride || prev.agentId;
      if (!aid) return prev;
      const socket = getSocket();
      if (socket) socket.emit('file:list', { agentId: aid, dirPath });
      return { ...prev, loading: true, error: '', selected: new Set(), search: '' };
    });
  }, []);

  const selectAgent = (agent: Agent) => {
    setRemote(prev => ({ ...prev, agentId: agent.id, path: '', files: [], parentPath: '', selected: new Set(), search: '', showSearch: false }));
    setDropdownOpen(false);
    navigateRemote('', agent.id);
  };

  /* ── transfer: local → agent ── */
  const transferToAgent = () => {
    if (!remote.agentId || local.selected.size === 0) return;
    const socket = getSocket();
    if (!socket) return;
    const selectedFiles = local.files.filter(f => local.selected.has(f.path) && !f.isDirectory);
    if (selectedFiles.length === 0) return;

    const newJobs: TransferJob[] = [];
    for (const file of selectedFiles) {
      const transferId = `tf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      newJobs.push({ id: transferId, fileName: file.name, status: 'pending' });
      socket.emit('local:transfer:to-agent', {
        filePath: file.path,
        destAgentId: remote.agentId,
        destPath: remote.path,
        transferId,
      });
    }
    setTransfers(prev => [...newJobs, ...prev]);
  };

  /* ── transfer: agent → local ── */
  const transferFromAgent = () => {
    if (!remote.agentId || remote.selected.size === 0) return;
    const socket = getSocket();
    if (!socket) return;
    const selectedFiles = remote.files.filter(f => remote.selected.has(f.path) && !f.isDirectory);
    if (selectedFiles.length === 0) return;

    const newJobs: TransferJob[] = [];
    for (const file of selectedFiles) {
      const transferId = `tf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      newJobs.push({ id: transferId, fileName: file.name, status: 'pending' });
      socket.emit('local:transfer:from-agent', {
        sourceAgentId: remote.agentId,
        filePath: file.path,
        destPath: local.path,
        transferId,
      });
    }
    setTransfers(prev => [...newJobs, ...prev]);
  };

  const toggleSelect = (side: 'local' | 'remote', filePath: string) => {
    const setter = side === 'local' ? setLocal : (fn: any) => setRemote(fn);
    setter((prev: any) => {
      const next = new Set(prev.selected);
      if (next.has(filePath)) next.delete(filePath); else next.add(filePath);
      return { ...prev, selected: next };
    });
  };

  const onlineAgents = agents.filter(a => a.status === 'online');

  // Clear completed after 5s
  useEffect(() => {
    const done = transfers.filter(t => t.status === 'done' || t.status === 'error');
    if (done.length === 0) return;
    const timer = setTimeout(() => {
      setTransfers(prev => prev.filter(t => t.status !== 'done' && t.status !== 'error'));
    }, 6000);
    return () => clearTimeout(timer);
  }, [transfers]);

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto py-8 pr-8 space-y-4">
      {/* Header */}
      <div>
        <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight flex items-center gap-2`}>
          <ArrowLeftRight className="w-6 h-6 text-cyan-400" />
          SFTP — Передача файлов
        </h2>
        <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-400'} mt-1`}>
          Слева — ваше хранилище, справа — подключённое устройство
        </p>
      </div>

      {/* Transfer progress bar */}
      {transfers.length > 0 && (
        <div className="space-y-1.5">
          {transfers.map(t => (
            <div key={t.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[12px] border ${
              t.status === 'done' ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400'
              : t.status === 'error' ? 'bg-red-500/5 border-red-500/10 text-red-400'
              : 'bg-cyan-500/5 border-cyan-500/10 text-cyan-400'
            }`}>
              {t.status === 'done' ? <Check className="w-3.5 h-3.5" />
                : t.status === 'error' ? <X className="w-3.5 h-3.5" />
                : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span className="font-medium">{t.fileName}</span>
              {t.size ? <span className="text-zinc-600">{formatBytes(t.size)}</span> : null}
              <span className="text-zinc-600 ml-auto">
                {t.status === 'pending' ? 'Ожидание...' : t.status === 'reading' ? 'Чтение...' : t.status === 'writing' ? 'Запись...' : t.status === 'done' ? 'Готово' : t.error || 'Ошибка'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Split panes */}
      <div className="flex-1 min-h-0 flex gap-2">
        {/* Left panel — LOCAL STORAGE via File System Access API */}
        {!local.handleStack || local.handleStack.length === 0 ? (
          <div className={`flex-1 flex flex-col rounded-2xl border ${isDark ? 'border-zinc-800/60' : 'border-gray-200'} fm-container overflow-hidden`}>
            <div className={`${isDark ? 'bg-[#111114] border-zinc-800/60' : 'bg-gray-50 border-gray-200'} border-b px-4 py-3`}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_4px_#22d3ee]" />
                <Server className={`w-4 h-4 ${isDark ? 'text-zinc-400' : 'text-gray-400'}`} />
                <span className={`text-[13px] font-semibold ${isDark ? 'text-white' : 'text-gray-900'} flex-1`}>Моё хранилище</span>
                <span className={`text-[10px] ${isDark ? 'text-zinc-600' : 'text-gray-400'} font-mono`}>Браузер</span>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className={`w-14 h-14 ${isDark ? 'bg-zinc-900' : 'bg-gray-100'} rounded-2xl flex items-center justify-center mx-auto mb-3`}>
                  <FolderOpen className={`w-7 h-7 ${isDark ? 'text-zinc-700' : 'text-gray-300'}`} />
                </div>
                <p className={`${isDark ? 'text-zinc-600' : 'text-gray-400'} text-sm font-medium mb-3`}>Выберите папку для начала</p>
                <button
                  onClick={handleSelectRoot}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isDark
                      ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
                      : 'bg-cyan-500/10 text-cyan-600 hover:bg-cyan-500/20'
                  }`}
                >
                  Выбрать папку
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0">
            <FilePanel
              panel={local}
              isDark={isDark}
              headerContent={
                <div className="flex items-center gap-2 px-4 py-3">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_4px_#22d3ee]" />
                  <Server className={`w-4 h-4 ${isDark ? 'text-zinc-400' : 'text-gray-400'}`} />
                  <span className={`text-[13px] font-semibold ${isDark ? 'text-white' : 'text-gray-900'} flex-1`}>Моё хранилище</span>
                  <button
                    onClick={handleChangeRoot}
                    className={`text-[11px] px-2 py-1 rounded transition-colors ${
                      isDark ? 'text-zinc-500 hover:text-white bg-zinc-800/40 hover:bg-zinc-800' : 'text-gray-500 hover:text-gray-900 bg-gray-200/40 hover:bg-gray-200'
                    }`}
                  >
                    Изменить
                  </button>
                  <span className={`text-[10px] ${isDark ? 'text-zinc-600' : 'text-gray-400'} font-mono`}>Браузер</span>
                </div>
              }
              onNavigate={navigateLocalDirectory}
              onNavigateUp={navigateLocalUp}
              onRefresh={refreshLocalDirectory}
              onToggleSelect={(p) => toggleSelect('local', p)}
              onToggleSearch={() => setLocal(p => ({ ...p, showSearch: !p.showSearch, search: '' }))}
              onSearchChange={(v) => setLocal(p => ({ ...p, search: v }))}
              isLocalBrowser
            />
          </div>
        )}

        {/* Center transfer buttons */}
        <div className="flex flex-col items-center justify-center gap-2 px-1">
          <button
            onClick={transferToAgent}
            disabled={!remote.agentId || local.selected.size === 0}
            className={`p-2.5 rounded-xl ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-500' : 'bg-gray-100 border-gray-200 text-gray-400'} border hover:text-cyan-400 hover:border-cyan-500/30 hover:bg-cyan-500/5 disabled:opacity-20 disabled:cursor-default transition-all`}
            title="Отправить на устройство →"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={transferFromAgent}
            disabled={!remote.agentId || remote.selected.size === 0}
            className={`p-2.5 rounded-xl ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-500' : 'bg-gray-100 border-gray-200 text-gray-400'} border hover:text-cyan-400 hover:border-cyan-500/30 hover:bg-cyan-500/5 disabled:opacity-20 disabled:cursor-default transition-all`}
            title="← Забрать с устройства"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Right panel — REMOTE AGENT */}
        <div className="flex-1 flex flex-col min-w-0">
          {!remote.agentId ? (
            <div className={`flex-1 flex flex-col rounded-2xl border ${isDark ? 'border-zinc-800/60' : 'border-gray-200'} fm-container overflow-hidden`}>
              <AgentSelector
                agent={null}
                agents={onlineAgents}
                dropdownOpen={dropdownOpen}
                onToggleDropdown={() => setDropdownOpen(v => !v)}
                onSelectAgent={selectAgent}
                isDark={isDark}
              />
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className={`w-14 h-14 ${isDark ? 'bg-zinc-900' : 'bg-gray-100'} rounded-2xl flex items-center justify-center mx-auto mb-3`}>
                    <Monitor className={`w-7 h-7 ${isDark ? 'text-zinc-800' : 'text-gray-300'}`} />
                  </div>
                  <p className={`${isDark ? 'text-zinc-600' : 'text-gray-400'} text-sm font-medium`}>Выберите устройство</p>
                </div>
              </div>
            </div>
          ) : (
            <FilePanel
              panel={remote}
              isDark={isDark}
              headerContent={
                <AgentSelector
                  agent={onlineAgents.find(a => a.id === remote.agentId) || null}
                  agents={onlineAgents}
                  dropdownOpen={dropdownOpen}
                  onToggleDropdown={() => setDropdownOpen(v => !v)}
                  onSelectAgent={selectAgent}
                  isDark={isDark}
                />
              }
              onNavigate={(p) => navigateRemote(p)}
              onToggleSelect={(p) => toggleSelect('remote', p)}
              onToggleSearch={() => setRemote(p => ({ ...p, showSearch: !p.showSearch, search: '' }))}
              onSearchChange={(v) => setRemote(p => ({ ...p, search: v }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   FILE PANEL — generic panel for file browsing
   ══════════════════════════════════════════════════════════ */
function FilePanel({
  panel, isDark, headerContent, onNavigate, onNavigateUp, onRefresh, onToggleSelect, onToggleSearch, onSearchChange, isLocalBrowser,
}: {
  panel: PanelState;
  isDark: boolean;
  headerContent: React.ReactNode;
  onNavigate?: (path: string) => void | Promise<void>;
  onNavigateUp?: () => void;
  onRefresh?: () => void;
  onToggleSelect: (path: string) => void;
  onToggleSearch: () => void;
  onSearchChange: (v: string) => void;
  isLocalBrowser?: boolean;
}) {
  const breadcrumbs = useMemo(() => {
    const sep = panel.path.includes('/') ? '/' : '\\';
    const parts = panel.path.split(/[/\\]/).filter(Boolean);
    const crumbs: { label: string; path: string }[] = [];
    let acc = '';
    for (const part of parts) {
      acc += part + sep;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }, [panel.path]);

  const displayFiles = useMemo(() => {
    let list = [...panel.files];
    if (panel.search) {
      const q = panel.search.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q));
    }
    const dirs = list.filter(f => f.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
    const files = list.filter(f => !f.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
    return [...dirs, ...files];
  }, [panel.files, panel.search]);

  const handleNavUp = useCallback(async () => {
    if (isLocalBrowser && onNavigateUp) {
      onNavigateUp();
    } else if (panel.parentPath && onNavigate) {
      await onNavigate(panel.parentPath);
    }
  }, [isLocalBrowser, onNavigateUp, onNavigate, panel.parentPath]);

  const handleRefresh = useCallback(async () => {
    if (isLocalBrowser && onRefresh) {
      onRefresh();
    } else if (onNavigate) {
      await onNavigate(panel.path);
    }
  }, [isLocalBrowser, onRefresh, onNavigate, panel.path]);

  const handleNavigate = useCallback(async (path: string) => {
    if (onNavigate) {
      await onNavigate(path);
    }
  }, [onNavigate]);

  return (
    <div className={`flex-1 flex flex-col rounded-2xl border ${isDark ? 'border-zinc-800/60' : 'border-gray-200'} fm-container overflow-hidden`}>
      {/* Custom header */}
      <div className={`${isDark ? 'bg-[#111114] border-zinc-800/60' : 'bg-gray-50 border-gray-200'} border-b`}>
        {headerContent}
      </div>

      {/* Breadcrumb bar */}
      <div className={`flex items-center gap-1 px-3 py-2 ${isDark ? 'bg-[#111114] border-zinc-800/40' : 'bg-gray-50 border-gray-100'} border-b`}>
        <button
          onClick={handleNavUp}
          disabled={!panel.parentPath}
          className={`p-1 rounded ${isDark ? 'text-zinc-600 hover:text-white hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200'} disabled:opacity-20 transition-colors`}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleRefresh}
          className={`p-1 rounded ${isDark ? 'text-zinc-600 hover:text-white hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200'} transition-colors`}
        >
          <RefreshCw className={`w-3 h-3 ${panel.loading ? 'animate-spin' : ''}`} />
        </button>

        <div className="flex items-center ml-1 gap-0.5 min-w-0 overflow-x-auto flex-1">
          {breadcrumbs.map((c, i) => (
            <div key={c.path} className="flex items-center flex-shrink-0">
              {i > 0 && <ChevronRight className={`w-3 h-3 ${isDark ? 'text-zinc-700' : 'text-gray-300'} mx-0.5`} />}
              {i === 0 && panel.drives && panel.drives.length > 0 && !isLocalBrowser ? (
                <div className={`flex items-center rounded transition-colors px-1 py-0.5 ${i === breadcrumbs.length - 1 ? (isDark ? 'bg-zinc-800/40 text-white' : 'bg-gray-200/40 text-gray-900') : (isDark ? 'text-zinc-500 hover:bg-zinc-800/40' : 'text-gray-500 hover:bg-gray-200/40')}`}>
                  <HardDrive className="w-3 h-3 text-sky-400 mr-1" />
                  <select
                    className="text-[12px] font-medium appearance-none bg-transparent outline-none border-none cursor-pointer pr-1"
                    value={c.label.replace('\\', '')}
                    onChange={(e) => handleNavigate(e.target.value + (e.target.value === '/' ? '' : '\\'))}
                  >
                    {panel.drives.map(d => <option key={d} value={d} className={isDark ? 'bg-zinc-800 text-white' : 'bg-white text-gray-900'}>{d}</option>)}
                  </select>
                </div>
              ) : (
                <button
                  onClick={() => handleNavigate(c.path)}
                  className={`px-1.5 py-0.5 rounded text-[12px] transition-colors ${
                    i === breadcrumbs.length - 1 ? (isDark ? 'text-white font-medium bg-zinc-800/40' : 'text-gray-900 font-medium bg-gray-200/40') : (isDark ? 'text-zinc-600 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700')
                  }`}
                >
                  {i === 0 && <HardDrive className="w-3 h-3 text-sky-400 inline mr-1 -mt-0.5" />}
                  {c.label}
                </button>
              )}
            </div>
          ))}
        </div>

        {panel.showSearch && (
          <div className={`flex items-center ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-100 border-gray-200'} border rounded px-2 py-0.5`}>
            <Search className={`w-3 h-3 ${isDark ? 'text-zinc-600' : 'text-gray-400'} mr-1`} />
            <input
              type="text" value={panel.search} onChange={e => onSearchChange(e.target.value)}
              placeholder="Filter..." autoFocus
              className={`bg-transparent text-[12px] ${isDark ? 'text-zinc-300 placeholder-zinc-700' : 'text-gray-700 placeholder-gray-400'} outline-none w-24`}
            />
          </div>
        )}
        <button
          onClick={onToggleSearch}
          className={`p-1 rounded transition-colors ${panel.showSearch ? 'text-blue-400 bg-blue-500/10' : isDark ? 'text-zinc-600 hover:text-white hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200'}`}
        >
          <Filter className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Error */}
      {panel.error && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/5 border-b border-red-500/10">
          <AlertCircle className="w-3 h-3 text-red-400" />
          <span className="text-[11px] text-red-400">{panel.error}</span>
        </div>
      )}

      {/* File table */}
      <div className="flex-1 overflow-auto fm-scroll">
        {panel.loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <RefreshCw className={`w-5 h-5 ${isDark ? 'text-zinc-700' : 'text-gray-400'} animate-spin mb-2`} />
            <span className={`text-[12px] ${isDark ? 'text-zinc-700' : 'text-gray-400'}`}>Загрузка...</span>
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className={`sticky top-0 ${isDark ? 'bg-[#0d0d10]' : 'bg-white'} z-10`}>
              <tr className={`border-b ${isDark ? 'border-zinc-800/40' : 'border-gray-100'}`}>
                <th className="w-8" />
                <th className={`py-2 px-3 text-left text-[10px] font-semibold ${isDark ? 'text-zinc-600' : 'text-gray-400'} uppercase tracking-wider`}>Name</th>
                <th className={`py-2 px-3 text-left text-[10px] font-semibold ${isDark ? 'text-zinc-600' : 'text-gray-400'} uppercase tracking-wider w-36`}>Date Modified</th>
                <th className={`py-2 px-3 text-left text-[10px] font-semibold ${isDark ? 'text-zinc-600' : 'text-gray-400'} uppercase tracking-wider w-20`}>Size</th>
                <th className={`py-2 px-3 text-left text-[10px] font-semibold ${isDark ? 'text-zinc-600' : 'text-gray-400'} uppercase tracking-wider w-16`}>Kind</th>
              </tr>
            </thead>
            <tbody>
              {panel.parentPath && (
                <tr className="fm-row cursor-pointer" onClick={() => handleNavUp()}>
                  <td />
                  <td className="py-1.5 px-3" colSpan={4}>
                    <div className="flex items-center gap-2">
                      <Folder className="w-4 h-4 text-sky-400" fill="currentColor" fillOpacity={0.15} />
                      <span className={isDark ? 'text-zinc-500' : 'text-gray-400'}>..</span>
                    </div>
                  </td>
                </tr>
              )}
              {displayFiles.map(file => {
                const selected = panel.selected.has(file.path);
                return (
                  <tr
                    key={file.path}
                    className={`fm-row group ${file.isDirectory ? 'cursor-pointer' : ''} ${selected ? '!bg-cyan-500/[0.06]' : ''}`}
                    onClick={() => {
                      if (file.isDirectory) {
                        handleNavigate(file.path);
                      } else {
                        onToggleSelect(file.path);
                      }
                    }}
                  >
                    <td className="pl-3 pr-0 py-1.5">
                      {!file.isDirectory && (
                        <div className={`w-3.5 h-3.5 rounded border transition-all flex items-center justify-center ${
                          selected ? 'bg-cyan-500 border-cyan-500' : isDark ? 'border-zinc-700 group-hover:border-zinc-500' : 'border-gray-300 group-hover:border-gray-400'
                        }`}>
                          {selected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-3">
                      <div className="flex items-center gap-2.5">
                        {getFileIcon(file.name, file.isDirectory, !!file.error)}
                        <span className={`truncate ${file.isDirectory ? (isDark ? 'text-white font-medium' : 'text-gray-900 font-medium') : (isDark ? 'text-zinc-400' : 'text-gray-600')}`}>{file.name}</span>
                      </div>
                    </td>
                    <td className={`py-1.5 px-3 ${isDark ? 'text-zinc-700' : 'text-gray-400'} tabular-nums`}>
                      {file.modified
                        ? new Date(file.modified).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                        : '- -'
                      }
                    </td>
                    <td className={`py-1.5 px-3 ${isDark ? 'text-zinc-700' : 'text-gray-400'} font-mono tabular-nums`}>
                      {file.isDirectory ? '- -' : formatBytes(file.size)}
                    </td>
                    <td className={`py-1.5 px-3 ${isDark ? 'text-zinc-700' : 'text-gray-400'}`}>
                      {getFileKind(file.name, file.isDirectory)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className={`flex items-center justify-between px-3 py-1.5 ${isDark ? 'bg-[#111114] border-zinc-800/40 text-zinc-600' : 'bg-gray-50 border-gray-100 text-gray-400'} border-t text-[10px]`}>
        <span>
          {panel.selected.size > 0
            ? `${panel.selected.size} выбрано`
            : `${displayFiles.length} элементов`
          }
        </span>
        <span className="font-mono truncate ml-4">{panel.path}</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   AGENT SELECTOR — dropdown for picking a connected agent
   ══════════════════════════════════════════════════════════ */
function AgentSelector({
  agent, agents, dropdownOpen, onToggleDropdown, onSelectAgent, isDark,
}: {
  agent: Agent | null;
  agents: Agent[];
  dropdownOpen: boolean;
  onToggleDropdown: () => void;
  onSelectAgent: (a: Agent) => void;
  isDark: boolean;
}) {
  return (
    <div className={`h-full flex flex-col ${isDark ? 'bg-[#1e1e1e] text-[#d4d4d4]' : 'bg-[#f5f6f7] text-[#1c1c1c]'} overflow-hidden`}>
      {/* Top action/info bar if needed (Optional, termius doesn't have a huge title) */}
      <div className="px-6 py-4 flex items-center justify-between shadow-sm z-10 bg-inherit hidden">
        <h2 className="text-xl font-semibold flex items-center gap-2">SFTP</h2>
      </div>

      <div className="flex-1 flex max-h-screen min-h-0">
        
        {/* === LEFT PANEL (LOCAL) === */}
        <div className={`flex-1 flex flex-col border-r ${isDark ? 'border-[#333]' : 'border-[#e0e0e0]'} min-h-0 bg-inherit`}>
          
          {/* Header */}
          <div className={`h-14 flex items-center justify-between px-4 border-b ${isDark ? 'border-[#333]' : 'border-[#f0f0f0]'}`}>
            <div className="flex items-center gap-2 font-medium">
              <div className="w-6 h-6 rounded bg-sky-500 text-white flex items-center justify-center">
                <Monitor className="w-4 h-4" />
              </div>
              <span className="text-[15px]">Local</span>
            </div>
            <div className="flex items-center gap-4 text-sm font-medium text-gray-500">
              <button className="flex items-center gap-1 hover:text-gray-900"><Search className="w-4 h-4" /> Filter</button>
              <button className="flex items-center gap-1 hover:text-gray-900">Actions <ChevronDown className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Breadcrumbs Topbar */}
          <div className="h-12 flex items-center px-2 text-[14px] text-gray-600 gap-1 font-medium">
            <button className="p-1.5 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-700" onClick={navigateLocalUp} disabled={!local.handleStack || local.handleStack.length <= 1}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="p-1.5 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-700">
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Select root / drives */}
            <div className="ml-2 flex items-center gap-1">
               <Folder className="w-4 h-4 text-sky-400" fill="currentColor" fillOpacity={0.2} />
               <button onClick={handleChangeRoot} className="hover:underline font-semibold text-gray-800">C:</button>
               <ChevronRight className="w-3 h-3 text-gray-400 mx-1" />
               <Folder className="w-4 h-4 text-sky-400" fill="currentColor" fillOpacity={0.2} />
               <span className="text-gray-800 font-semibold">{local.path || '/'}</span>
            </div>
          </div>

          {/* Table Headers */}
          <div className={`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-2 text-xs font-semibold ${isDark ? 'text-gray-400 bg-[#252526]' : 'text-gray-500 bg-[#fafafa] border-y border-[#f0f0f0]'}`}>
            <div>Name</div>
            <div className="flex items-center gap-1">Date Modified <ChevronDown className="w-3 h-3" /></div>
            <div>Size</div>
            <div>Kind</div>
          </div>

          {/* Local List */}
          <div className="flex-1 overflow-y-auto select-none pb-20">
            {local.loading && (
              <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mb-2" /> Загрузка...
              </div>
            )}
            {!local.loading && local.error && (
               <div className="p-6 text-sm text-red-500 text-center">{local.error}</div>
            )}
            
            {/* Parent Directory Item */}
            {!local.loading && !local.error && local.handleStack && local.handleStack.length > 1 && (
               <div 
                  onDoubleClick={navigateLocalUp}
                  className={`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-1.5 min-h-[36px] items-center text-[13px] hover:bg-sky-50 cursor-pointer text-gray-800`}
                >
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-sky-400" fill="currentColor" fillOpacity={0.2} />
                    <span>..</span>
                  </div>
                  <div className="text-gray-400">-</div>
                  <div className="text-gray-400">- -</div>
                  <div className="text-gray-400 text-xs">folder</div>
                </div>
            )}

            {!local.loading && !local.error && local.files.map(f => {
              const isSelected = local.selected.has(f.path);
              return (
                <div 
                  key={f.path}
                  onClick={(e) => {
                    const next = new Set(local.selected);
                    if (e.ctrlKey || e.metaKey) {
                      if (next.has(f.path)) next.delete(f.path); else next.add(f.path);
                    } else {
                      next.clear(); next.add(f.path);
                    }
                    setLocal(p => ({ ...p, selected: next }));
                  }}
                  onDoubleClick={() => {
                    if (f.isDirectory) navigateLocalDirectory(f.name);
                    else {
                       // Do nothing or download to somewhere
                    }
                  }}
                  className={`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-1.5 min-h-[36px] items-center text-[13px] cursor-pointer transition-colors ${
                    isSelected 
                      ? 'bg-[#5bb0f9] text-white' 
                      : isDark ? 'hover:bg-[#2c2d2e] text-gray-300' : 'hover:bg-[#f0f7ff] text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden text-ellipsis pr-2">
                    {getFileIcon(f.name, f.isDirectory, !!f.error)}
                    <span className={`truncate ${isSelected ? 'font-medium text-white' : 'font-medium'}`}>{f.name}</span>
                  </div>
                  <div className={`${isSelected ? 'text-blue-100' : 'text-gray-400'} text-xs`}>
                    {f.modified ? new Date(f.modified).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                  </div>
                  <div className={`${isSelected ? 'text-blue-100' : 'text-gray-400'} text-xs`}>
                    {f.isDirectory ? '- -' : formatBytes(f.size || 0)}
                  </div>
                  <div className={`${isSelected ? 'text-blue-100' : 'text-gray-400'} text-xs opacity-80`}>
                    {getFileKind(f.name, f.isDirectory)}
                  </div>
                </div>
              );
            })}
            
            {/* Initial Placeholder */}
            {!local.loading && !local.handleStack?.length && !local.error && (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-400">
                <HardDrive className="w-12 h-12 mb-4 opacity-50 text-sky-400" />
                <p className="text-sm font-medium mb-4">Нажмите кнопку ниже, чтобы запросить доступ к локальным файлам в браузере.</p>
                <button onClick={handleSelectRoot} className="px-6 py-2 bg-[#5bb0f9] hover:bg-sky-500 text-white rounded font-medium shadow-sm transition">
                  Выбрать директорию
                </button>
              </div>
            )}
          </div>
        </div>


        {/* === RIGHT PANEL (REMOTE) === */}
        <div className={`flex-1 flex flex-col min-h-0 bg-inherit ${isDark ? 'border-l border-[#333]' : 'border-[#e0e0e0]'}`}>
          
          {/* Header */}
          <div className={`h-14 flex items-center justify-between px-4 border-b ${isDark ? 'border-[#333]' : 'border-[#f0f0f0]'}`}>
            <div className="flex items-center gap-2 font-medium">
              <div className="w-6 h-6 rounded bg-[#e83e8c] text-white flex items-center justify-center">
                <Server className="w-4 h-4 flex-shrink-0" />
              </div>
              
              {/* Agent selector Dropdown */}
               <div className="relative z-50">
                <button 
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-1 text-[15px] hover:text-gray-600"
                >
                  {onlineAgents.find(a => a.id === remote.agentId)?.hostname || 'Выберите устройство...'}
                  <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                </button>
                {dropdownOpen && (
                  <div className={`absolute top-full left-0 mt-1 w-64 rounded shadow-lg border ${isDark ? 'bg-[#252526] border-[#333]' : 'bg-white border-gray-200'}`}>
                    {onlineAgents.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500 text-center">Нет онлайн ПК</div>
                    ) : (
                      onlineAgents.map(a => (
                        <div 
                          key={a.id}
                          onClick={() => selectAgent(a)}
                          className={`px-4 py-2 text-sm cursor-pointer ${isDark ? 'hover:bg-[#333]' : 'hover:bg-gray-100'}`}
                        >
                          {a.hostname} <span className="text-xs text-gray-400">({a.ip})</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm font-medium text-gray-500">
              <button className="flex items-center gap-1 hover:text-gray-900"><Search className="w-4 h-4" /> Filter</button>
              <button className="flex items-center gap-1 hover:text-gray-900">Actions <ChevronDown className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Breadcrumbs Topbar */}
          <div className="h-12 flex items-center px-2 text-[14px] text-gray-600 gap-1 font-medium bg-inherit">
            <button 
              className="p-1.5 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30" 
              onClick={() => {
                if (remote.parentPath || remote.parentPath === '') {
                   navigateRemote(remote.parentPath);
                }
              }} 
              disabled={!remote.agentId || !remote.path}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="p-1.5 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-700">
              <ChevronRight className="w-4 h-4" />
            </button>
            
            {remote.agentId && (
              <div className="ml-2 flex flex-wrap items-center text-sm gap-1">
                 {/* Disks logic */}
                 <div className="flex items-center gap-1 pr-1">
                    <HardDrive className="w-4 h-4 text-[#e83e8c] opacity-80" />
                    {remote.drives && remote.drives.length > 0 ? (
                        <select 
                          className={`bg-transparent border-none appearance-none font-semibold text-gray-800 focus:outline-none cursor-pointer p-0 m-0`}
                          value={remote.drives.find(d => remote.path.startsWith(d)) || remote.drives[0]}
                          onChange={(e) => navigateRemote(e.target.value + '\\')}
                          title="Выбрать диск устройства"
                        >
                          {remote.drives.map(d => (
                             <option key={d} value={d} className="text-black">{d}</option>
                          ))}
                        </select>
                    ) : (
                        <span className="font-semibold text-gray-800">C:</span>
                    )}
                 </div>
                 
                 <ChevronRight className="w-3 h-3 text-gray-400 mx-0.5" />
                 
                 {remote.path.split(/[\\/]/).filter(Boolean).map((part, i, arr) => {
                    const isDrive = /^[a-zA-Z]:$/.test(part);
                    if (isDrive) return null; // Already rendered in disk select
                    
                    const onClickPath = arr.slice(0, i + 1).join('\\');
                    return (
                        <React.Fragment key={i}>
                           {i > 0 && !isDrive && <ChevronRight className="w-3 h-3 text-gray-400 mx-0.5" />}
                           <div 
                             className="flex items-center gap-1 cursor-pointer hover:underline"
                             onClick={() => navigateRemote(onClickPath)}
                           >
                             <Folder className="w-3.5 h-3.5 text-sky-400" fill="currentColor" fillOpacity={0.2} />
                             <span className="text-gray-800 font-semibold max-w-[120px] truncate">{part}</span>
                           </div>
                        </React.Fragment>
                    )
                 })}
              </div>
            )}
          </div>

          {/* Table Headers */}
          <div className={`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-2 text-xs font-semibold ${isDark ? 'text-gray-400 bg-[#252526]' : 'text-gray-500 bg-[#fafafa] border-y border-[#f0f0f0]'}`}>
            <div>Name</div>
            <div className="flex items-center gap-1">Date Modified <ChevronDown className="w-3 h-3" /></div>
            <div>Size</div>
            <div>Kind</div>
          </div>

          {/* Remote List or Empty State */}
          <div className="flex-1 overflow-y-auto select-none pb-20 relative bg-inherit">
            {!remote.agentId ? (
              <div className="flex flex-col items-center justify-center h-[80%] text-center">
                 {/* Termius stylish empty state */}
                 <div className="relative w-80 h-80 flex items-center justify-center">
                    {/* Corners */}
                    <svg className="absolute inset-0 w-full h-full text-gray-300 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path d="M 0 10 L 0 0 L 10 0" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M 90 0 L 100 0 L 100 10" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M 100 90 L 100 100 L 90 100" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M 10 100 L 0 100 L 0 90" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    
                    <div className="flex flex-col items-center">
                        <ArrowDownCircle className="w-16 h-16 text-gray-500 mb-4 stroke-1" />
                        <h3 className="text-xl font-bold text-gray-800">Drop files here</h3>
                    </div>
                 </div>
              </div>
            ) : remote.loading ? (
              <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mb-2" />
                Чтение ПК...
              </div>
            ) : remote.error ? (
              <div className="p-6 text-sm text-red-500 text-center">{remote.error}</div>
            ) : (
               <>
                 {remote.parentPath !== '' && (
                    <div 
                      onDoubleClick={() => navigateRemote(remote.parentPath)}
                      className={`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-1.5 min-h-[36px] items-center text-[13px] hover:bg-sky-50 cursor-pointer text-gray-800`}
                    >
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4 text-sky-400" fill="currentColor" fillOpacity={0.2} />
                        <span>..</span>
                      </div>
                      <div className="text-gray-400">-</div>
                      <div className="text-gray-400">- -</div>
                      <div className="text-gray-400 text-xs">folder</div>
                    </div>
                 )}

                 {remote.files.map(f => {
                    const isSelected = remote.selected.has(f.path);
                    return (
                      <div 
                        key={f.path}
                        onClick={(e) => {
                          const next = new Set(remote.selected);
                          if (e.ctrlKey || e.metaKey) {
                            if (next.has(f.path)) next.delete(f.path); else next.add(f.path);
                          } else {
                            next.clear(); next.add(f.path);
                          }
                          setRemote(p => ({ ...p, selected: next }));
                        }}
                        onDoubleClick={() => {
                          if (f.isDirectory) navigateRemote(f.path);
                        }}
                        className={`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-1.5 min-h-[36px] items-center text-[13px] cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-[#5bb0f9] text-white' 
                            : isDark ? 'hover:bg-[#2c2d2e] text-gray-300' : 'hover:bg-[#f0f7ff] text-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden text-ellipsis pr-2">
                          {getFileIcon(f.name, f.isDirectory, !!f.error)}
                          <span className={`truncate ${isSelected ? 'font-medium text-white' : 'font-medium'}`}>{f.name}</span>
                        </div>
                        <div className={`${isSelected ? 'text-blue-100' : 'text-gray-400'} text-xs`}>
                          {f.modified ? new Date(f.modified).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                        </div>
                        <div className={`${isSelected ? 'text-blue-100' : 'text-gray-400'} text-xs`}>
                          {f.isDirectory ? '- -' : formatBytes(f.size || 0)}
                        </div>
                        <div className={`${isSelected ? 'text-blue-100' : 'text-gray-400'} text-xs opacity-80`}>
                          {getFileKind(f.name, f.isDirectory)}
                        </div>
                      </div>
                    );
                 })}
               </>
            )}
          </div>
        </div>

      </div>

      {/* Floating Transfer Actions (Instead of old middle buttons to match Termius clean look) */}
      {(local.selected.size > 0 || remote.selected.size > 0) && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#1a1a1a] text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-6 z-50">
           {local.selected.size > 0 && (
             <div className="flex items-center gap-3">
               <span className="text-sm font-medium">{local.selected.size} файлов выбрано</span>
               <button 
                 onClick={transferToAgent}
                 disabled={!remote.agentId || !remote.path}
                 className="flex items-center gap-1.5 bg-[#4caf50] hover:bg-[#43a047] disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
               >
                 Загрузить на ПК <ArrowRight className="w-4 h-4" />
               </button>
             </div>
           )}

           {local.selected.size > 0 && remote.selected.size > 0 && (
             <div className="w-px h-6 bg-gray-600"></div>
           )}

           {remote.selected.size > 0 && (
             <div className="flex items-center gap-3">
               <button 
                 onClick={transferFromAgent}
                 disabled={!local.path || local.loading}
                 className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
               >
                 <ArrowLeft className="w-4 h-4" /> Скачать в браузер
               </button>
               <span className="text-sm font-medium">{remote.selected.size} файлов выбрано</span>
             </div>
           )}
        </div>
      )}

      {/* Transfer Progress Overlays */}
      {transfers.length > 0 && (
        <div className="fixed bottom-0 right-8 w-80 max-h-[400px] overflow-auto bg-white border border-gray-200 shadow-2xl rounded-t-xl z-50 flex flex-col">
          <div className="px-4 py-3 border-b flex items-center justify-between sticky top-0 bg-white">
            <h4 className="font-semibold text-sm">Передачи ({transfers.filter(t => t.status !== 'done' && t.status !== 'error').length})</h4>
            <button className="text-gray-400 hover:text-gray-800" onClick={() => setTransfers([])}><X className="w-4 h-4" /></button>
          </div>
          <div className="p-3 space-y-2">
            {transfers.map(job => (
              <div key={job.id} className="text-xs flex items-center gap-3">
                {job.status === 'done' ? <Check className="w-4 h-4 text-green-500 flex-shrink-0" /> :
                 job.status === 'error' ? <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" /> :
                 <Loader2 className="w-4 h-4 text-sky-500 animate-spin flex-shrink-0" />}
                
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-gray-800">{job.fileName}</div>
                  <div className="text-gray-400 capitalize">{job.status} {job.size ? `(${formatBytes(job.size)})` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

console.log(typeof FileTransfer);