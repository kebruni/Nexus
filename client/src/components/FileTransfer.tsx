import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getSocket } from '../api/socket';
import type { Agent, FileItem, FileListResult } from '../types';
import {
  Folder,
  File,
  HardDrive,
  Lock,
  ChevronRight,
  Search,
  FileText,
  FileImage,
  FileArchive,
  FileCode,
  FileVideo,
  FileAudio,
  Loader2,
  Upload,
  Download,
  FolderPlus,
  Pencil,
  Trash2,
  RefreshCw,
  ChevronDown,
  Check,
  X,
  UploadCloud,
  Server,
  ArrowUpDown,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

const API_BASE = '/api';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—';
  const k = 1024;
  const s = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + s[i];
}

type SortKey = 'name' | 'modified' | 'size' | 'kind';
type SortDir = 'asc' | 'desc';

function getFileKind(name: string, isDir: boolean): string {
  if (isDir) return 'folder';
  return name.split('.').pop()?.toLowerCase() || 'file';
}

function getFileIcon(name: string, isDir: boolean, hasError: boolean, size = 'w-4 h-4') {
  if (hasError) return <Lock className={`${size} text-red-400/60`} />;
  if (isDir) return <Folder className={`${size} text-sky-400`} fill="currentColor" fillOpacity={0.15} />;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'ico', 'webp'];
  const codeExts = ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'rs', 'go', 'rb', 'php', 'html', 'css', 'scss', 'json', 'xml', 'yaml', 'yml'];
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];
  const videoExts = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm'];
  const audioExts = ['mp3', 'wav', 'flac', 'ogg', 'aac'];
  if (imgExts.includes(ext)) return <FileImage className={`${size} text-emerald-400/70`} />;
  if (codeExts.includes(ext)) return <FileCode className={`${size} text-blue-400/70`} />;
  if (archiveExts.includes(ext)) return <FileArchive className={`${size} text-amber-400/70`} />;
  if (videoExts.includes(ext)) return <FileVideo className={`${size} text-purple-400/70`} />;
  if (audioExts.includes(ext)) return <FileAudio className={`${size} text-pink-400/70`} />;
  if (['txt', 'log', 'md', 'pdf', 'doc', 'docx'].includes(ext)) return <FileText className={`${size} text-zinc-400/70`} />;
  return <File className={`${size} text-zinc-500/70`} />;
}

export default function FileTransfer() {
  const { isDark } = useTheme();
  const { t } = useLanguage();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState('');
  const [drives, setDrives] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [showMkdir, setShowMkdir] = useState(false);
  const [mkdirName, setMkdirName] = useState('');
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mkdirInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const onlineAgents = useMemo(() => agents.filter(a => a.status === 'online'), [agents]);
  const selectedAgent = useMemo(() => agents.find(a => a.id === agentId), [agents, agentId]);

  const navigate = useCallback((dirPath: string, aid?: string) => {
    const id = aid || agentId;
    if (!id) return;
    const socket = getSocket();
    if (!socket) return;
    setLoading(true);
    setError('');
    setSelected(new Set());
    setSearchQuery('');
    setShowMkdir(false);
    setRenamingPath(null);
    socket.emit('file:list', { agentId: id, dirPath });
  }, [agentId]);

  const refresh = useCallback(() => {
    if (agentId) navigate(currentPath);
  }, [agentId, currentPath, navigate]);

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
    const onList = (list: Agent[]) => setAgents(list);
    socket.on('agents:list', onList);
    return () => { socket.off('agents:list', onList); };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onFileList = (data: FileListResult & { agentId: string; drives?: string[] }) => {
      if (data.agentId !== agentId) return;
      setLoading(false);
      if (data.success) {
        setFiles(data.files);
        setCurrentPath(data.path);
        setParentPath(data.parentPath);
        if (data.drives) setDrives(data.drives);
        setError('');
      } else {
        setError(data.error || 'Failed to list directory');
      }
    };
    const onDeleteResult = (data: { agentId: string; success: boolean; error?: string }) => {
      if (data.agentId !== agentId) return;
      if (!data.success) setError(data.error || 'Delete failed');
      refresh();
    };
    const onMkdirResult = (data: { agentId: string; success: boolean; error?: string }) => {
      if (data.agentId !== agentId) return;
      setShowMkdir(false);
      setMkdirName('');
      if (!data.success) setError(data.error || 'Create folder failed');
      refresh();
    };
    const onRenameResult = (data: { agentId: string; success: boolean; error?: string }) => {
      if (data.agentId !== agentId) return;
      setRenamingPath(null);
      setRenameValue('');
      if (!data.success) setError(data.error || 'Rename failed');
      refresh();
    };
    const onContent = (data: { agentId: string; success: boolean; name?: string; content?: string; mimeType?: string; error?: string }) => {
      if (data.agentId !== agentId) return;
      if (!data.success || !data.content) {
        setError(data.error || 'Download failed');
        return;
      }
      const binary = atob(data.content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: data.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.name || 'file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
    const onTransferComplete = (data: { agentId: string; success: boolean; error?: string }) => {
      if (data.agentId !== agentId) return;
      setUploading(false);
      setUploadProgress('');
      if (!data.success) setError(data.error || 'Upload failed');
      else refresh();
    };

    socket.on('file:list:result', onFileList);
    socket.on('file:delete:result', onDeleteResult);
    socket.on('file:mkdir:result', onMkdirResult);
    socket.on('file:rename:result', onRenameResult);
    socket.on('file:content:result', onContent);
    socket.on('file:transfer:complete', onTransferComplete);
    return () => {
      socket.off('file:list:result', onFileList);
      socket.off('file:delete:result', onDeleteResult);
      socket.off('file:mkdir:result', onMkdirResult);
      socket.off('file:rename:result', onRenameResult);
      socket.off('file:content:result', onContent);
      socket.off('file:transfer:complete', onTransferComplete);
    };
  }, [agentId, refresh]);

  const selectAgent = (agent: Agent) => {
    setAgentId(agent.id);
    setDropdownOpen(false);
    setFiles([]);
    setCurrentPath('');
    setSelected(new Set());
    navigate('', agent.id);
  };

  const handleDownload = () => {
    const socket = getSocket();
    if (!socket || !agentId) return;
    const sel = files.filter(f => selected.has(f.path) && !f.isDirectory);
    for (const f of sel) {
      socket.emit('file:download', { agentId, filePath: f.path });
    }
  };

  const handleDelete = () => {
    if (!agentId || selected.size === 0) return;
    const names = files.filter(f => selected.has(f.path)).map(f => f.name);
    if (!window.confirm(`Delete ${names.length} item(s)?\n${names.join(', ')}`)) return;
    const socket = getSocket();
    if (!socket) return;
    for (const p of selected) {
      socket.emit('file:delete', { agentId, filePath: p });
    }
    setSelected(new Set());
  };

  const handleMkdir = () => {
    if (!mkdirName.trim() || !agentId) return;
    const socket = getSocket();
    if (!socket) return;
    const sep = currentPath.includes('\\') ? '\\' : '/';
    const newDir = currentPath + sep + mkdirName.trim();
    socket.emit('file:mkdir', { agentId, dirPath: newDir });
  };

  const handleRename = () => {
    if (!renameValue.trim() || !renamingPath || !agentId) return;
    const socket = getSocket();
    if (!socket) return;
    const sep = currentPath.includes('\\') ? '\\' : '/';
    const parts = renamingPath.split(/[\\/]/);
    parts[parts.length - 1] = renameValue.trim();
    const newPath = parts.join(sep);
    socket.emit('file:rename', { agentId, oldPath: renamingPath, newPath });
  };

  const handleUploadFiles = (fileList: globalThis.FileList) => {
    if (!agentId || fileList.length === 0) return;
    const socket = getSocket();
    if (!socket) return;
    setUploading(true);
    let done = 0;
    const total = fileList.length;
    setUploadProgress(`0 / ${total}`);
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        socket.emit('file:upload', {
          agentId,
          fileName: file.name,
          fileData: base64,
          remotePath: currentPath,
        });
        done++;
        setUploadProgress(`${done} / ${total}`);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  const toggleSort = useCallback((field: SortKey) => {
    setSortKey(prev => {
      if (prev === field) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortDir('asc');
      return field;
    });
  }, []);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const visible = q ? files.filter(f => f.name.toLowerCase().includes(q)) : files;
    const dirs = visible.filter(f => f.isDirectory);
    const regular = visible.filter(f => !f.isDirectory);
    const compare = (a: FileItem, b: FileItem) => {
      let r = 0;
      switch (sortKey) {
        case 'modified': {
          const at = a.modified ? new Date(a.modified).getTime() : 0;
          const bt = b.modified ? new Date(b.modified).getTime() : 0;
          r = at - bt;
          break;
        }
        case 'size': r = (a.size || 0) - (b.size || 0); break;
        case 'kind': r = getFileKind(a.name, a.isDirectory).localeCompare(getFileKind(b.name, b.isDirectory)); break;
        default: r = a.name.localeCompare(b.name);
      }
      return sortDir === 'desc' ? -r : r;
    };
    return [...dirs.sort(compare), ...regular.sort(compare)];
  }, [files, searchQuery, sortKey, sortDir]);

  const pathSegments = useMemo(() => {
    if (!currentPath) return [];
    const sep = currentPath.includes('\\') ? '\\' : '/';
    const parts = currentPath.split(sep).filter(Boolean);
    const segments: { name: string; path: string }[] = [];
    let acc = sep === '\\' ? '' : '/';
    for (const part of parts) {
      acc = acc ? acc + (acc.endsWith(sep) ? '' : sep) + part : part;
      segments.push({ name: part, path: acc });
    }
    return segments;
  }, [currentPath]);

  const bg = isDark ? 'bg-zinc-900' : 'bg-white';
  const border = isDark ? 'border-zinc-800' : 'border-gray-200';
  const hoverRow = isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-sky-50';
  const selectedRow = isDark ? 'bg-sky-900/40' : 'bg-sky-100';
  const textMuted = isDark ? 'text-zinc-500' : 'text-gray-400';

  return (
    <div className="space-y-4">
      <header className="nx-page-head">
        <div className="nx-page-head-text">
          <h1 className="nx-page-title">{t('fileManager.title')}</h1>
          <p className="nx-page-sub">{agentId ? `${files.length} items in ${currentPath || '/'}` : `${onlineAgents.length} devices available`}</p>
        </div>

        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
            className="nx-btn is-primary flex items-center gap-2"
          >
            <Server className="w-4 h-4" />
            {selectedAgent ? selectedAgent.hostname : 'Pick a device…'}
            <ChevronDown className="w-4 h-4" />
          </button>
          {dropdownOpen && (
            <div className={`absolute right-0 top-full mt-1 w-64 rounded-lg shadow-xl border z-50 py-1 ${isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200'}`}>
              {onlineAgents.length === 0 && (
                <div className={`px-4 py-3 text-sm ${textMuted}`}>No devices online</div>
              )}
              {onlineAgents.map(a => (
                <button
                  key={a.id}
                  onMouseDown={() => selectAgent(a)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm ${hoverRow} ${a.id === agentId ? selectedRow : ''}`}
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <div>
                    <div className="font-medium">{a.hostname}</div>
                    <div className={`text-xs ${textMuted}`}>{a.os || a.platform || 'Unknown OS'}</div>
                  </div>
                  {a.id === agentId && <Check className="w-4 h-4 ml-auto text-sky-400" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {!agentId && (
        <div className={`rounded-xl border ${border} ${bg} p-16 text-center`}>
          <Server className={`w-12 h-12 mx-auto mb-4 ${textMuted}`} />
          <h3 className="text-lg font-semibold mb-1">Select a device</h3>
          <p className={`text-sm ${textMuted}`}>Pick a connected device to browse its file system</p>
        </div>
      )}

      {agentId && (
        <div
          className={`rounded-xl border ${border} ${bg} overflow-hidden`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          {/* Toolbar */}
          <div className={`flex items-center gap-1 px-3 py-2 border-b ${border}`}>
            <button onClick={() => fileInputRef.current?.click()} className="nx-btn text-xs gap-1.5" title="Upload files">
              <Upload className="w-3.5 h-3.5" /> Upload
            </button>
            <button onClick={handleDownload} disabled={selected.size === 0 || files.filter(f => selected.has(f.path) && !f.isDirectory).length === 0} className="nx-btn text-xs gap-1.5" title="Download selected files">
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <div className={`w-px h-5 mx-1 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`} />
            <button onClick={() => { setShowMkdir(true); setTimeout(() => mkdirInputRef.current?.focus(), 50); }} className="nx-btn text-xs gap-1.5" title="New folder">
              <FolderPlus className="w-3.5 h-3.5" /> New folder
            </button>
            <button
              onClick={() => {
                if (selected.size !== 1) return;
                const p = Array.from(selected)[0];
                const f = files.find(fi => fi.path === p);
                if (f) { setRenamingPath(f.path); setRenameValue(f.name); setTimeout(() => renameInputRef.current?.focus(), 50); }
              }}
              disabled={selected.size !== 1}
              className="nx-btn text-xs gap-1.5"
              title="Rename"
            >
              <Pencil className="w-3.5 h-3.5" /> Rename
            </button>
            <button onClick={handleDelete} disabled={selected.size === 0} className="nx-btn text-xs gap-1.5 text-red-400 hover:text-red-300" title="Delete selected">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <div className="flex-1" />
            <button onClick={() => setShowSearch(!showSearch)} className={`nx-btn text-xs ${showSearch ? 'is-active' : ''}`} title="Search">
              <Search className="w-3.5 h-3.5" />
            </button>
            <button onClick={refresh} className="nx-btn text-xs" title="Refresh">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Breadcrumbs */}
          <div className={`flex items-center gap-1 px-3 py-2 text-sm border-b ${border} overflow-x-auto`}>
            {drives.length > 0 && drives.map(d => (
              <button key={d} onClick={() => navigate(d.endsWith(':') ? d + '\\' : d)} className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${hoverRow} ${textMuted}`}>
                <HardDrive className="w-3 h-3" /> {d}
              </button>
            ))}
            {drives.length > 0 && pathSegments.length > 0 && <div className={`w-px h-4 mx-1 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`} />}
            {pathSegments.map((seg, i) => (
              <span key={seg.path} className="flex items-center gap-1 whitespace-nowrap">
                {i > 0 && <ChevronRight className={`w-3 h-3 ${textMuted}`} />}
                <button onClick={() => navigate(seg.path)} className={`px-1.5 py-0.5 rounded text-xs font-medium ${hoverRow} ${i === pathSegments.length - 1 ? '' : textMuted}`}>
                  {seg.name}
                </button>
              </span>
            ))}
          </div>

          {/* Search bar */}
          {showSearch && (
            <div className={`flex items-center gap-2 px-3 py-2 border-b ${border}`}>
              <Search className={`w-4 h-4 ${textMuted}`} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter files…"
                className="nx-input flex-1 text-sm"
                autoFocus
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="nx-btn text-xs"><X className="w-3 h-3" /></button>
              )}
            </div>
          )}

          {/* Mkdir inline */}
          {showMkdir && (
            <div className={`flex items-center gap-2 px-3 py-2 border-b ${border}`}>
              <FolderPlus className="w-4 h-4 text-sky-400" />
              <input
                ref={mkdirInputRef}
                value={mkdirName}
                onChange={e => setMkdirName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleMkdir(); if (e.key === 'Escape') { setShowMkdir(false); setMkdirName(''); } }}
                placeholder="Folder name…"
                className="nx-input flex-1 text-sm"
              />
              <button onClick={handleMkdir} className="nx-btn is-primary text-xs gap-1"><Check className="w-3 h-3" /> Create</button>
              <button onClick={() => { setShowMkdir(false); setMkdirName(''); }} className="nx-btn text-xs"><X className="w-3 h-3" /></button>
            </div>
          )}

          {/* Upload progress */}
          {uploading && (
            <div className={`flex items-center gap-2 px-3 py-2 border-b ${border} text-sm`}>
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              <span>Uploading… {uploadProgress}</span>
            </div>
          )}

          {/* Drag overlay */}
          {dragging && (
            <div className="absolute inset-0 z-40 bg-sky-500/10 border-2 border-dashed border-sky-400 rounded-xl flex items-center justify-center">
              <div className="text-center">
                <UploadCloud className="w-12 h-12 text-sky-400 mx-auto mb-2" />
                <p className="text-sm font-medium">Drop files here to upload</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-4 py-2 text-sm text-red-400 bg-red-500/10 border-b border-red-500/20">
              {error}
              <button onClick={() => setError('')} className="ml-2 text-red-300 hover:text-red-200"><X className="w-3 h-3 inline" /></button>
            </div>
          )}

          {/* Table header */}
          <div className={`grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] px-4 py-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-zinc-500 bg-zinc-900/50' : 'text-gray-400 bg-gray-50'}`}>
            {(['name', 'modified', 'size', 'kind'] as SortKey[]).map(field => (
              <div
                key={field}
                onClick={() => toggleSort(field)}
                className={`flex items-center gap-1 cursor-pointer select-none transition-colors ${field === 'size' ? 'justify-end' : ''} ${isDark ? 'hover:text-zinc-300' : 'hover:text-gray-700'}`}
              >
                {field === 'name' ? 'Name' : field === 'modified' ? 'Modified' : field === 'size' ? 'Size' : 'Kind'}
                {sortKey === field && <ArrowUpDown className="w-3 h-3 text-blue-400" />}
              </div>
            ))}
          </div>

          {/* File list */}
          <div className="max-h-[60vh] overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
              </div>
            )}

            {!loading && parentPath && parentPath !== currentPath && (
              <div
                onDoubleClick={() => navigate(parentPath)}
                className={`grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] px-4 py-2 items-center text-sm cursor-pointer ${hoverRow}`}
              >
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-sky-400" fill="currentColor" fillOpacity={0.15} />
                  <span className="font-medium">..</span>
                </div>
                <div className={textMuted}>—</div>
                <div className={`text-right ${textMuted}`}>—</div>
                <div className={textMuted}>—</div>
              </div>
            )}

            {!loading && filteredFiles.map(f => {
              const isSelected = selected.has(f.path);
              const isRenaming = renamingPath === f.path;
              return (
                <div
                  key={f.path}
                  onClick={(e) => {
                    if (isRenaming) return;
                    const next = new Set(selected);
                    if (e.ctrlKey || e.metaKey) {
                      if (next.has(f.path)) next.delete(f.path); else next.add(f.path);
                    } else {
                      next.clear();
                      next.add(f.path);
                    }
                    setSelected(next);
                  }}
                  onDoubleClick={() => {
                    if (isRenaming) return;
                    if (f.isDirectory) navigate(f.path);
                  }}
                  className={`grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] px-4 py-2 items-center text-sm cursor-pointer transition-colors ${
                    isSelected ? selectedRow : hoverRow
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {getFileIcon(f.name, f.isDirectory, !!f.error)}
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setRenamingPath(null); setRenameValue(''); } }}
                        onBlur={() => { setRenamingPath(null); setRenameValue(''); }}
                        className="nx-input text-sm flex-1 py-0"
                        onClick={e => e.stopPropagation()}
                        onDoubleClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="truncate font-medium">{f.name}</span>
                    )}
                  </div>
                  <div className={`text-xs ${isSelected ? '' : textMuted}`}>
                    {f.modified ? new Date(f.modified).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </div>
                  <div className={`text-xs text-right ${isSelected ? '' : textMuted}`}>
                    {f.isDirectory ? '—' : formatBytes(f.size || 0)}
                  </div>
                  <div className={`text-xs ${isSelected ? '' : textMuted}`}>
                    {getFileKind(f.name, f.isDirectory)}
                  </div>
                </div>
              );
            })}

            {!loading && filteredFiles.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center py-16">
                {searchQuery ? (
                  <>
                    <Search className={`w-8 h-8 mb-2 ${textMuted}`} />
                    <p className={`text-sm ${textMuted}`}>No files matching &ldquo;{searchQuery}&rdquo;</p>
                  </>
                ) : (
                  <>
                    <Folder className={`w-8 h-8 mb-2 ${textMuted}`} />
                    <p className={`text-sm ${textMuted}`}>This folder is empty</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`flex items-center justify-between px-4 py-2 border-t ${border} text-xs ${textMuted}`}>
            <span>{filteredFiles.length} items{selected.size > 0 ? ` · ${selected.size} selected` : ''}</span>
            <span>{currentPath}</span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) handleUploadFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
      )}
    </div>
  );
}
