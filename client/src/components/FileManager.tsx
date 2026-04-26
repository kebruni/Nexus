import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Filter,
  Folder,
  HardDrive,
  Lock,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { getSocket } from '../api/socket';
import { useTheme } from '../contexts/ThemeContext';
import type { FileItem, FileListResult } from '../types';

interface FileManagerProps {
  agentId: string;
}

type SortKey = 'name' | 'modified' | 'size' | 'kind';
type SortDir = 'asc' | 'desc';

interface SortHeaderProps {
  className?: string;
  field: SortKey;
  isDark: boolean;
  label: string;
  onToggle: (field: SortKey) => void;
  sortKey: SortKey;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '--';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const sizeIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** sizeIndex;

  return `${value.toFixed(sizeIndex === 0 ? 0 : 2)} ${units[sizeIndex]}`;
}

function formatModifiedDate(value: string | null): string {
  if (!value) return '--';

  return new Date(value).toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    hour12: true,
    minute: '2-digit',
    month: 'numeric',
    year: 'numeric',
  });
}

function getFileKind(name: string, isDirectory: boolean): string {
  if (isDirectory) return 'folder';
  return name.split('.').pop()?.toLowerCase() || 'file';
}

function getFileIcon(name: string, isDirectory: boolean, hasError: boolean) {
  if (hasError) return <Lock className="w-[18px] h-[18px] text-red-400/60" />;
  if (isDirectory) return <Folder className="w-[18px] h-[18px] text-sky-400" fill="currentColor" fillOpacity={0.15} />;

  const extension = name.split('.').pop()?.toLowerCase() || '';
  const imageExtensions = ['bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'];
  const codeExtensions = ['c', 'cpp', 'cs', 'css', 'go', 'h', 'html', 'java', 'js', 'json', 'jsx', 'php', 'py', 'rb', 'rs', 'scss', 'ts', 'tsx', 'xml'];
  const archiveExtensions = ['7z', 'gz', 'rar', 'tar', 'zip'];
  const videoExtensions = ['avi', 'mkv', 'mov', 'mp4', 'webm', 'wmv'];
  const audioExtensions = ['aac', 'flac', 'mp3', 'ogg', 'wav'];
  const textExtensions = ['doc', 'docx', 'log', 'md', 'pdf', 'txt'];

  if (imageExtensions.includes(extension)) return <FileImage className="w-[18px] h-[18px] text-emerald-400/70" />;
  if (codeExtensions.includes(extension)) return <FileCode className="w-[18px] h-[18px] text-blue-400/70" />;
  if (archiveExtensions.includes(extension)) return <FileArchive className="w-[18px] h-[18px] text-amber-400/70" />;
  if (videoExtensions.includes(extension)) return <FileVideo className="w-[18px] h-[18px] text-purple-400/70" />;
  if (audioExtensions.includes(extension)) return <FileAudio className="w-[18px] h-[18px] text-pink-400/70" />;
  if (textExtensions.includes(extension)) return <FileText className="w-[18px] h-[18px] text-zinc-400/70" />;

  return <File className="w-[18px] h-[18px] text-zinc-500/70" />;
}

function SortHeader({ className = '', field, isDark, label, onToggle, sortKey }: SortHeaderProps) {
  return (
    <th
      className={`py-2.5 px-4 text-left text-[11px] font-semibold ${isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700'} uppercase tracking-wider cursor-pointer select-none transition-colors ${className}`}
      onClick={() => onToggle(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === field && <ArrowUpDown className="w-3 h-3 text-blue-400" />}
      </span>
    </th>
  );
}

export default function FileManager({ agentId }: FileManagerProps) {
  const { isDark } = useTheme();
  const [currentPath, setCurrentPath] = useState('C:\\');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [parentPath, setParentPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showSearch, setShowSearch] = useState(false);

  const navigateTo = useCallback((path: string) => {
    const socket = getSocket();
    if (!socket) return;

    setLoading(true);
    setError('');
    setConfirmDelete(null);
    setSearchQuery('');
    socket.emit('file:list', { agentId, dirPath: path });
  }, [agentId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleResult = (data: FileListResult & { agentId: string }) => {
      if (data.agentId !== agentId) return;

      setLoading(false);

      if (!data.success) {
        setError(data.error || 'Failed to list directory');
        return;
      }

      setFiles(data.files);
      setCurrentPath(data.path);
      setParentPath(data.parentPath);
      setError('');
    };

    const handleFileContent = (data: { agentId: string; success: boolean; content?: string; error?: string; mimeType?: string; name?: string }) => {
      if (data.agentId !== agentId) return;

      if (!data.success || !data.content || !data.name) {
        setError(data.error || 'Failed to download file');
        return;
      }

      const binaryString = atob(data.content);
      const bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: data.mimeType || 'application/octet-stream' });
      const fileUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');

      downloadLink.href = fileUrl;
      downloadLink.download = data.name;
      downloadLink.click();
      URL.revokeObjectURL(fileUrl);
    };

    socket.on('file:list:result', handleResult);
    socket.on('file:content:result', handleFileContent);
    socket.emit('file:list', { agentId, dirPath: 'C:\\' });

    return () => {
      socket.off('file:list:result', handleResult);
      socket.off('file:content:result', handleFileContent);
    };
  }, [agentId]);

  const handleDownload = (file: FileItem) => {
    const socket = getSocket();
    if (!socket) return;

    socket.emit('file:download', { agentId, filePath: file.path });
  };

  const handleDelete = (file: FileItem) => {
    const socket = getSocket();
    if (!socket) return;

    socket.emit('file:delete', { agentId, filePath: file.path });
    setConfirmDelete(null);
    window.setTimeout(() => navigateTo(currentPath), 500);
  };

  const toggleSort = useCallback((field: SortKey) => {
    setSortKey((currentKey) => {
      if (currentKey === field) {
        setSortDir((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
        return currentKey;
      }

      setSortDir('asc');
      return field;
    });
  }, []);

  const breadcrumbs = useMemo(() => {
    const separator = currentPath.includes('/') ? '/' : '\\';
    const parts = currentPath.split(/[/\\]/).filter(Boolean);
    const crumbs: Array<{ label: string; path: string }> = [];
    let accumulatedPath = '';

    for (const part of parts) {
      accumulatedPath += `${part}${separator}`;
      crumbs.push({ label: part, path: accumulatedPath });
    }

    return crumbs;
  }, [currentPath]);

  const displayFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const visibleFiles = query ? files.filter((file) => file.name.toLowerCase().includes(query)) : files;
    const directories = visibleFiles.filter((file) => file.isDirectory);
    const regularFiles = visibleFiles.filter((file) => !file.isDirectory);

    const compareFiles = (left: FileItem, right: FileItem) => {
      let result = 0;

      switch (sortKey) {
        case 'modified': {
          const leftTime = left.modified ? new Date(left.modified).getTime() : 0;
          const rightTime = right.modified ? new Date(right.modified).getTime() : 0;
          result = leftTime - rightTime;
          break;
        }
        case 'size':
          result = (left.size || 0) - (right.size || 0);
          break;
        case 'kind':
          result = getFileKind(left.name, left.isDirectory).localeCompare(getFileKind(right.name, right.isDirectory));
          break;
        case 'name':
        default:
          result = left.name.localeCompare(right.name);
          break;
      }

      return sortDir === 'desc' ? -result : result;
    };

    return [...directories.sort(compareFiles), ...regularFiles.sort(compareFiles)];
  }, [files, searchQuery, sortDir, sortKey]);

  return (
    <div className={`fm-container flex flex-col h-full rounded-2xl overflow-hidden border ${isDark ? 'border-zinc-800/60' : 'border-gray-200'}`}>
      <div className={`flex items-center justify-between px-4 py-2.5 ${isDark ? 'bg-[#111114] border-zinc-800/60' : 'bg-gray-50 border-gray-200'} border-b`}>
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={() => parentPath && navigateTo(parentPath)}
            disabled={!parentPath}
            className={`p-1.5 rounded-lg ${isDark ? 'text-zinc-500 hover:text-white hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200'} disabled:opacity-30 disabled:cursor-default transition-colors`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigateTo(currentPath)}
            className={`p-1.5 rounded-lg ${isDark ? 'text-zinc-500 hover:text-white hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200'} transition-colors`}
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <div className="flex items-center ml-2 gap-0.5 min-w-0 overflow-auto">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.path} className="flex items-center">
                {index > 0 && <ChevronRight className={`w-3.5 h-3.5 ${isDark ? 'text-zinc-700' : 'text-gray-300'} mx-0.5`} />}
                <button
                  onClick={() => navigateTo(crumb.path)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[13px] transition-colors whitespace-nowrap ${
                    index === breadcrumbs.length - 1
                      ? isDark
                        ? 'text-white font-medium bg-zinc-800/50'
                        : 'text-gray-900 font-medium bg-gray-200/50'
                      : isDark
                        ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                        : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {index === 0 ? <HardDrive className="w-3.5 h-3.5 text-sky-400" /> : <Folder className="w-3.5 h-3.5 text-sky-400/60" />}
                  {crumb.label}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {showSearch && (
            <div className={`flex items-center ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-100 border-gray-200'} border rounded-lg px-2.5 py-1 mr-1`}>
              <Search className={`w-3.5 h-3.5 ${isDark ? 'text-zinc-600' : 'text-gray-400'} mr-1.5`} />
              <input
                autoFocus
                className={`bg-transparent text-sm ${isDark ? 'text-zinc-300 placeholder-zinc-600' : 'text-gray-700 placeholder-gray-400'} outline-none w-36`}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Filter files..."
                type="text"
                value={searchQuery}
              />
            </div>
          )}
          <button
            onClick={() => {
              setShowSearch((current) => !current);
              if (showSearch) setSearchQuery('');
            }}
            className={`p-1.5 rounded-lg transition-colors ${showSearch ? 'text-blue-400 bg-blue-500/10' : isDark ? 'text-zinc-500 hover:text-white hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200'}`}
            title="Filter"
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/5 border-b border-red-500/10">
          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
          <span className="text-[12px] text-red-400">{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-auto fm-scroll">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <RefreshCw className={`w-5 h-5 ${isDark ? 'text-zinc-600' : 'text-gray-400'} animate-spin mb-2`} />
            <span className={`text-sm ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Loading files...</span>
          </div>
        ) : displayFiles.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center py-20">
            <HardDrive className={`w-8 h-8 ${isDark ? 'text-zinc-800' : 'text-gray-300'} mb-3`} />
            <span className={`text-sm ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
              {searchQuery ? 'No matching files' : 'Folder is empty'}
            </span>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className={`sticky top-0 ${isDark ? 'bg-[#0d0d10]' : 'bg-white'} z-10 border-b ${isDark ? 'border-zinc-800/40' : 'border-gray-100'}`}>
              <tr>
                <SortHeader field="name" isDark={isDark} label="Name" onToggle={toggleSort} sortKey={sortKey} />
                <SortHeader className="w-44" field="modified" isDark={isDark} label="Date Modified" onToggle={toggleSort} sortKey={sortKey} />
                <SortHeader className="w-28" field="size" isDark={isDark} label="Size" onToggle={toggleSort} sortKey={sortKey} />
                <SortHeader className="w-24" field="kind" isDark={isDark} label="Kind" onToggle={toggleSort} sortKey={sortKey} />
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {parentPath && (
                <tr className="fm-row cursor-pointer" onClick={() => navigateTo(parentPath)}>
                  <td className="py-2 px-4" colSpan={5}>
                    <div className="flex items-center gap-3">
                      <Folder className="w-[18px] h-[18px] text-sky-400" fill="currentColor" fillOpacity={0.15} />
                      <span className={isDark ? 'text-zinc-400 font-medium' : 'text-gray-500 font-medium'}>..</span>
                    </div>
                  </td>
                </tr>
              )}
              {displayFiles.map((file) => (
                <tr
                  key={file.path}
                  className={`fm-row group ${file.isDirectory ? 'cursor-pointer' : ''}`}
                  onClick={() => file.isDirectory && navigateTo(file.path)}
                >
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-3">
                      {getFileIcon(file.name, file.isDirectory, Boolean(file.error))}
                      <span className={file.isDirectory ? isDark ? 'text-white font-medium' : 'text-gray-900 font-medium' : isDark ? 'text-zinc-400' : 'text-gray-600'}>
                        {file.name}
                      </span>
                    </div>
                  </td>
                  <td className={`py-2 px-4 ${isDark ? 'text-zinc-600' : 'text-gray-400'} text-[12px] tabular-nums`}>
                    {formatModifiedDate(file.modified)}
                  </td>
                  <td className={`py-2 px-4 ${isDark ? 'text-zinc-600' : 'text-gray-400'} text-[12px] font-mono tabular-nums`}>
                    {file.isDirectory ? '--' : formatBytes(file.size)}
                  </td>
                  <td className={`py-2 px-4 ${isDark ? 'text-zinc-600' : 'text-gray-400'} text-[12px]`}>
                    {getFileKind(file.name, file.isDirectory)}
                  </td>
                  <td className="py-2 px-4">
                    {!file.error && (
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!file.isDirectory && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDownload(file);
                            }}
                            className={`p-1 ${isDark ? 'text-zinc-600 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'} rounded transition-colors`}
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {confirmDelete === file.path ? (
                          <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                            <button className="px-1.5 py-0.5 bg-red-600 text-white text-[10px] rounded font-medium" onClick={() => handleDelete(file)}>
                              Yes
                            </button>
                            <button className="px-1.5 py-0.5 bg-zinc-700 text-zinc-300 text-[10px] rounded font-medium" onClick={() => setConfirmDelete(null)}>
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setConfirmDelete(file.path);
                            }}
                            className={`p-1 ${isDark ? 'text-zinc-600 hover:text-red-400' : 'text-gray-400 hover:text-red-600'} rounded transition-colors`}
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={`flex items-center justify-between px-4 py-2 ${isDark ? 'bg-[#111114] border-zinc-800/60 text-zinc-600' : 'bg-gray-50 border-gray-200 text-gray-400'} border-t text-[11px]`}>
        <span>{displayFiles.length} items</span>
        <span className="font-mono">{currentPath}</span>
      </div>
    </div>
  );
}
