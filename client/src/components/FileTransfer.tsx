import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getSocket } from '../api/socket';
import type { Agent, FileItem, FileListResult } from '../types';
import {
  Folder,
  File,
  HardDrive,
  AlertCircle,
  Lock,
  ChevronLeft,
  ChevronRight,
  Search,
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
  Server,
  ArrowDownCircle,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const API_BASE = '/api';

/* в”Ђв”Ђ helpers в”Ђв”Ђ */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return 'вЂ”';
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

/* в”Ђв”Ђ types в”Ђв”Ђ */
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

/* в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ */
export default function FileTransfer() {
  const { isDark } = useTheme();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [local, setLocal] = useState<PanelState>({ ...defaultPanel });
  const [remote, setRemote] = useState<PanelState & { agentId: string | null }>({ ...defaultPanel, agentId: null });
  const [transfers, setTransfers] = useState<TransferJob[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [localActionsOpen, setLocalActionsOpen] = useState(false);
  const [remoteActionsOpen, setRemoteActionsOpen] = useState(false);

  /* в”Ђв”Ђ load local files via File System Access API в”Ђв”Ђ */
  const loadFilesFromHandle = async (handle: FileSystemDirectoryHandle, stack: FileSystemDirectoryHandle[]) => {
    setLocal(p => ({ ...p, loading: true, error: '' }));
    try {
      const files: FileItem[] = [];
      
      // Request permission if not already granted
      // @ts-expect-error File System Access API permission methods differ across browsers.
      if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') {
        // @ts-expect-error File System Access API permission methods differ across browsers.
        const result = await handle.requestPermission({ mode: 'read' });
        if (result !== 'granted') {
          throw new Error('Р”РѕСЃС‚СѓРї Р·Р°РїСЂРµС‰РµРЅ');
        }
      }

      // Read entries
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
          } catch {
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

    } catch (error: unknown) {
      setLocal(p => ({ ...p, loading: false, error: error instanceof Error ? error.message : 'Failed to load the folder' }));
    }
  };

  const handleSelectRoot = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        throw new Error('Р’Р°С€ Р±СЂР°СѓР·РµСЂ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚ File System Access API. РСЃРїРѕР»СЊР·СѓР№С‚Рµ Chrome/Edge.');
      }
      // @ts-expect-error showDirectoryPicker is available only in browsers that support the File System Access API.
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      await loadFilesFromHandle(dirHandle, [dirHandle]);
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setLocal(p => ({ ...p, error: error instanceof Error ? error.message : 'Failed to select a folder' }));
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
    } catch (error: unknown) {
      setLocal(p => ({ ...p, error: `Failed to navigate: ${error instanceof Error ? error.message : 'Unknown error'}` }));
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

  /* в”Ђв”Ђ agent list в”Ђв”Ђ */
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
    socket.on('agent:metrics', ({ agentId, metrics }: { agentId: string; metrics: Agent['metrics'] }) => {
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, metrics, status: 'online' as const } : a));
    });
    return () => { socket.off('agents:list'); socket.off('agent:metrics'); };
  }, []);

  /* в”Ђв”Ђ remote (agent) file list listener в”Ђв”Ђ */
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (data: FileListResult & { agentId: string; drives?: string[] }) => {
      setRemote(prev => {
        if (prev.agentId !== data.agentId) return prev;
        if (data.success) {
          return { ...prev, files: data.files, path: data.path, parentPath: data.parentPath, loading: false, error: '', selected: new Set(), drives: data.drives || prev.drives || [] };
        }
        return { ...prev, loading: false, error: data.error || 'Failed to list directory' };
      });
    };
    socket.on('file:list:result', handler);
    return () => { socket.off('file:list:result', handler); };
  }, []);

  /* в”Ђв”Ђ transfer status listener в”Ђв”Ђ */
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handleStatus = (data: { transferId: string; success?: boolean; size?: number; error?: string; status?: 'reading' | 'writing' }) => {
      setTransfers(prev => {
        const idx = prev.findIndex(t => t.id === data.transferId);
        if (idx === -1) return prev;
        const copy = [...prev];
        if (data.success !== undefined) {
          copy[idx] = { ...copy[idx], status: data.success ? 'done' : 'error', size: data.size, error: data.error };
        } else {
          copy[idx] = { ...copy[idx], status: data.status ?? copy[idx].status, size: data.size };
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

  /* в”Ђв”Ђ navigate remote (agent) в”Ђв”Ђ */
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

  /* в”Ђв”Ђ transfer: local в†’ agent в”Ђв”Ђ */
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

  /* в”Ђв”Ђ transfer: agent в†’ local в”Ђв”Ђ */
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

  const deleteRemoteFiles = () => {
    if (!remote.agentId || remote.selected.size === 0) return;

    const socket = getSocket();
    if (!socket) return;

    const selectedFiles = remote.files.filter((file) => remote.selected.has(file.path));
    if (selectedFiles.length === 0) return;

    selectedFiles.forEach((file) => {
      socket.emit('file:delete', { agentId: remote.agentId, filePath: file.path });
    });

    setRemote((previous) => ({ ...previous, selected: new Set() }));
    window.setTimeout(() => navigateRemote(remote.path), 400);
  };

  const onlineAgents = useMemo(() => agents.filter(a => a.status === 'online'), [agents]);

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
    <div className={`h-full flex flex-col ${isDark ? 'bg-[#1e1e1e] text-[#d4d4d4]' : 'bg-[#f5f6f7] text-[#1c1c1c]'} overflow-hidden`}>
      
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
              <button className={`flex items-center gap-1 ${isDark ? 'text-gray-400 hover:text-gray-200' : 'hover:text-gray-900'}`}><Search className="w-4 h-4" /> Filter</button>
              
              {/* Local Actions Dropdown */}
              <div className="relative z-50">
                <button 
                  onClick={() => setLocalActionsOpen(!localActionsOpen)} 
                  onBlur={() => setTimeout(() => setLocalActionsOpen(false), 200)}
                  className={`flex items-center gap-1 ${isDark ? 'text-gray-400 hover:text-gray-200' : 'hover:text-gray-900'}`}
                >
                  Actions <ChevronDown className="w-4 h-4" />
                </button>
                                {localActionsOpen && (
                  <div className={`absolute top-full right-0 mt-2 w-56 rounded-xl shadow-xl border py-1.5 z-50 text-[14px] text-left ${isDark ? 'bg-[#2a2a2b] border-[#3e3e42] text-[#e0e0e0]' : 'bg-white border-gray-200 text-gray-700'}`}>
                    <div className={`px-4 py-1.5 cursor-pointer ${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}`} onMouseDown={() => { transferToAgent(); setLocalActionsOpen(false); }}>Copy to target directory</div>
                    <div className={`px-4 py-1.5 cursor-pointer opacity-50`}>Rename</div>
                    <div className={`px-4 py-1.5 cursor-pointer opacity-50`}>Delete</div>
                    <div className={`h-px my-1 ${isDark ? 'bg-[#3e3e42]' : 'bg-gray-200'}`}></div>
                    <div className={`px-4 py-1.5 cursor-pointer ${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}`} onMouseDown={() => { refreshLocalDirectory(); setLocalActionsOpen(false); }}>Refresh</div>
                    <div className={`px-4 py-1.5 cursor-pointer opacity-50`}>New Folder</div>
                    <div className={`px-4 py-1.5 cursor-pointer opacity-50`}>Show Hidden Files</div>
                    <div className={`px-4 py-1.5 cursor-pointer ${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}`} onMouseDown={() => {
                        if (local.files) setLocal(p => ({...p, selected: new Set(p.files.map(f => f.path))}));
                        setLocalActionsOpen(false);
                    }}>Select All</div>
                    <div className={`h-px my-1 ${isDark ? 'bg-[#3e3e42]' : 'bg-gray-200'}`}></div>
                    <div className={`px-4 py-1.5 cursor-pointer text-red-500 ${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}`} onMouseDown={() => setLocalActionsOpen(false)}>Close</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Breadcrumbs Topbar */}
          <div className={`h-12 flex items-center px-2 text-[14px] text-gray-600 gap-1 font-medium bg-inherit`}>
            <button className="p-1.5 hover:bg-gray-200 dark:hover:bg-[#333] rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30" onClick={navigateLocalUp} disabled={!local.handleStack || local.handleStack.length <= 1}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="p-1.5 hover:bg-gray-200 dark:hover:bg-[#333] rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" disabled>
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Select root / drives */}
            <div className="ml-2 flex items-center gap-1">
               <button onClick={handleChangeRoot} className={`hover:bg-gray-200 dark:hover:bg-[#333] px-2 py-1 rounded flex items-center gap-1.5 transition-colors font-semibold ${isDark ? 'text-gray-300' : 'text-gray-800'}`} title="Выбрать другой локальный путь">
                 <Folder className="w-4 h-4 text-sky-400" fill="currentColor" fillOpacity={0.2} />
                 {local.handleStack && local.handleStack[0] ? local.handleStack[0].name : "Локальный диск"}
               </button>
               {local.handleStack && local.handleStack.length > 1 && (
                  <>
                     <ChevronRight className="w-3 h-3 text-gray-400 mx-1" />
                     {local.handleStack.slice(1).map((h, i, arr) => (
                         <React.Fragment key={i}>
                          <div className={`flex items-center gap-1 px-1.5 py-1 rounded cursor-pointer transition-colors ${isDark ? 'hover:bg-[#333]' : 'hover:bg-gray-200'}`} onClick={() => {
                            if (!local.handleStack) return;
                            const newStack = local.handleStack.slice(0, i + 2);
                            loadFilesFromHandle(newStack[newStack.length - 1], newStack);
                          }}>
                             <span className={`font-semibold max-w-[120px] truncate ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>{h.name}</span>
                           </div>
                           {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-gray-400 mx-0.5" />}
                         </React.Fragment>
                     ))}
                  </>
               )}
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
                  className={`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-1.5 min-h-[36px] items-center text-[13px] cursor-pointer ${isDark ? 'hover:bg-[#2c2d2e] text-gray-300' : 'hover:bg-[#f0f7ff] text-gray-800'}`}
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
                  }}
                  className={`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-1.5 min-h-[36px] items-center text-[13px] cursor-pointer transition-colors ${
                    isSelected 
                      ? 'bg-[#5bb0f9] text-white' 
                      : isDark ? 'hover:bg-[#2c2d2e] text-[#d4d4d4]' : 'hover:bg-[#f0f7ff] text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden text-ellipsis pr-2">
                    {getFileIcon(f.name, f.isDirectory, !!f.error)}
                    <span className={`truncate ${isSelected ? 'font-medium text-white' : 'font-medium'}`}>{f.name}</span>
                  </div>
                  <div className={`${isSelected ? 'text-blue-100' : 'text-gray-500'} text-xs`}>
                    {f.modified ? new Date(f.modified).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                  </div>
                  <div className={`${isSelected ? 'text-blue-100' : 'text-gray-500'} text-xs`}>
                    {f.isDirectory ? '- -' : formatBytes(f.size || 0)}
                  </div>
                  <div className={`${isSelected ? 'text-blue-100' : 'text-gray-500'} text-xs opacity-80`}>
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
                  Выбрать директорию (путь)
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
                  className={`flex items-center gap-1 text-[15px] ${isDark ? 'text-gray-200 hover:text-white' : 'hover:text-gray-600'}`}
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
                          className={`px-4 py-2 text-sm cursor-pointer ${isDark ? 'hover:bg-[#333] text-gray-200' : 'hover:bg-gray-100 text-gray-800'}`}
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
              <button className={`flex items-center gap-1 ${isDark ? 'text-gray-400 hover:text-gray-200' : 'hover:text-gray-900'}`}><Search className="w-4 h-4" /> Filter</button>
              
              {/* Remote Actions Dropdown */}
              <div className="relative z-50">
                <button 
                  onClick={() => setRemoteActionsOpen(!remoteActionsOpen)} 
                  onBlur={() => setTimeout(() => setRemoteActionsOpen(false), 200)}
                  className={`flex items-center gap-1 ${isDark ? 'text-gray-400 hover:text-gray-200' : 'hover:text-gray-900'}`}
                >
                  Actions <ChevronDown className="w-4 h-4" />
                </button>
                                {remoteActionsOpen && (
                  <div className={`absolute top-full right-0 mt-2 w-56 rounded-xl shadow-xl border py-1.5 z-50 text-[14px] text-left ${isDark ? 'bg-[#2a2a2b] border-[#3e3e42] text-[#e0e0e0]' : 'bg-white border-gray-200 text-gray-700'}`}>
                    <div className={`px-4 py-1.5 cursor-pointer ${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}`} onMouseDown={() => { transferFromAgent(); setRemoteActionsOpen(false); }}>Copy to target directory</div>
                    <div className={`px-4 py-1.5 cursor-pointer opacity-50`}>Rename</div>
                    <div className={`px-4 py-1.5 cursor-pointer text-red-500 ${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}`} onMouseDown={() => { deleteRemoteFiles(); setRemoteActionsOpen(false); }}>Delete</div>
                    <div className={`h-px my-1 ${isDark ? 'bg-[#3e3e42]' : 'bg-gray-200'}`}></div>
                    <div className={`px-4 py-1.5 cursor-pointer ${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}`} onMouseDown={() => { navigateRemote(remote.path); setRemoteActionsOpen(false); }}>Refresh</div>
                    <div className={`px-4 py-1.5 cursor-pointer opacity-50`}>New Folder</div>
                    <div className={`px-4 py-1.5 cursor-pointer opacity-50`}>Show Hidden Files</div>
                    <div className={`px-4 py-1.5 cursor-pointer ${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}`} onMouseDown={() => {
                        if (remote.files) setRemote(p => ({...p, selected: new Set(p.files.map(f => f.path))}));
                        setRemoteActionsOpen(false);
                    }}>Select All</div>
                    <div className={`h-px my-1 ${isDark ? 'bg-[#3e3e42]' : 'bg-gray-200'}`}></div>
                    <div className={`px-4 py-1.5 cursor-pointer text-red-500 ${isDark ? 'hover:bg-[#3e3e42]' : 'hover:bg-gray-100'}`} onMouseDown={() => setRemoteActionsOpen(false)}>Close</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Breadcrumbs Topbar */}
          <div className={`h-12 flex items-center px-2 text-[14px] text-gray-600 gap-1 font-medium bg-inherit`}>
            <button 
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-[#333] rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30" 
              onClick={() => {
                if (remote.parentPath || remote.parentPath === '') {
                   navigateRemote(remote.parentPath);
                }
              }} 
              disabled={!remote.agentId || !remote.path}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="p-1.5 hover:bg-gray-200 dark:hover:bg-[#333] rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30" disabled>
              <ChevronRight className="w-4 h-4" />
            </button>
            
            {remote.agentId && (
              <div className="ml-2 flex flex-wrap items-center text-sm gap-1">
                 {/* Disks logic formatted EXACTLY like the screenshot */}
                 <div className={`flex items-center gap-1.5 pr-1 px-2 py-1 rounded hover:bg-gray-200 ${isDark ? 'hover:bg-[#333]' : 'hover:bg-gray-200'} transition-colors`}>
                    <HardDrive className="w-4 h-4 text-[#e83e8c]" />
                    {remote.drives && remote.drives.length > 0 ? (
                        <select 
                          className={`bg-transparent border-none appearance-none font-semibold focus:outline-none cursor-pointer p-0 m-0 ${isDark ? 'text-gray-300' : 'text-gray-800'}`}
                          value={remote.drives.find(d => remote.path.startsWith(d)) || remote.drives[0]}
                          onChange={(e) => {
                            const v = e.target.value;
                            // POSIX root '/' is already a complete path; only append separator for Windows drive letters like 'C:'.
                            navigateRemote(v.startsWith('/') ? v : v + '\\');
                          }}
                          title="Выбрать диск устройства"
                        >
                          {remote.drives.map(d => (
                             <option key={d} value={d} className="text-black">{d}</option>
                          ))}
                        </select>
                    ) : (
                        <span className={`font-semibold ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>/</span>
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
                             className={`flex items-center gap-1 px-1.5 py-1 rounded cursor-pointer transition-colors ${isDark ? 'hover:bg-[#333]' : 'hover:bg-gray-200'}`}
                             onClick={() => navigateRemote(onClickPath)}
                           >
                             <Folder className="w-3.5 h-3.5 text-sky-400" fill="currentColor" fillOpacity={0.2} />
                             <span className={`font-semibold max-w-[120px] truncate ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>{part}</span>
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
                 <div className="relative w-80 h-80 flex items-center justify-center">
                    <svg className="absolute inset-0 w-full h-full text-gray-300 dark:text-[#333] pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path d="M 0 10 L 0 0 L 10 0" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M 90 0 L 100 0 L 100 10" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M 100 90 L 100 100 L 90 100" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M 10 100 L 0 100 L 0 90" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    
                    <div className="flex flex-col items-center">
                        <ArrowDownCircle className="w-16 h-16 text-gray-400 dark:text-[#555] mb-4 stroke-1" />
                        <h3 className={`text-xl font-bold ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>Drop files here</h3>
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
                      className={`grid grid-cols-[3fr_2fr_1fr_1fr] px-4 py-1.5 min-h-[36px] items-center text-[13px] cursor-pointer ${isDark ? 'hover:bg-[#2c2d2e] text-gray-300' : 'hover:bg-[#f0f7ff] text-gray-800'}`}
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
                            : isDark ? 'hover:bg-[#2c2d2e] text-[#d4d4d4]' : 'hover:bg-[#f0f7ff] text-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden text-ellipsis pr-2">
                          {getFileIcon(f.name, f.isDirectory, !!f.error)}
                          <span className={`truncate ${isSelected ? 'font-medium text-white' : 'font-medium'}`}>{f.name}</span>
                        </div>
                        <div className={`${isSelected ? 'text-blue-100' : 'text-gray-500'} text-xs`}>
                          {f.modified ? new Date(f.modified).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                        </div>
                        <div className={`${isSelected ? 'text-blue-100' : 'text-gray-500'} text-xs`}>
                          {f.isDirectory ? '- -' : formatBytes(f.size || 0)}
                        </div>
                        <div className={`${isSelected ? 'text-blue-100' : 'text-gray-500'} text-xs opacity-80`}>
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

      {/* Floating Transfer Actions */}
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
        <div className="fixed bottom-0 right-8 w-80 max-h-[400px] overflow-auto bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#333] shadow-2xl rounded-t-xl z-50 flex flex-col">
          <div className="px-4 py-3 border-b dark:border-[#333] flex items-center justify-between sticky top-0 bg-white dark:bg-[#1e1e1e]">
            <h4 className={`font-semibold text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Передачи ({transfers.filter(t => t.status !== 'done' && t.status !== 'error').length})</h4>
            <button className="text-gray-400 hover:text-gray-800 dark:hover:text-gray-200" onClick={() => setTransfers([])}><X className="w-4 h-4" /></button>
          </div>
          <div className="p-3 space-y-2">
            {transfers.map(job => (
              <div key={job.id} className="text-xs flex items-center gap-3">
                {job.status === 'done' ? <Check className="w-4 h-4 text-green-500 flex-shrink-0" /> :
                 job.status === 'error' ? <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" /> :
                 <Loader2 className="w-4 h-4 text-sky-500 animate-spin flex-shrink-0" />}
                
                <div className="flex-1 min-w-0">
                  <div className={`truncate font-medium ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>{job.fileName}</div>
                  <div className="text-gray-400 capitalize">{job.status} {job.size ? `(${formatBytes(job.size)})` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
