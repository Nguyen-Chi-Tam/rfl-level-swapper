import type React from 'react';
import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Upload, Download, Info, FileJson, Map as MapIcon, Hash, ChevronRight, X, FileArchive, ArrowRight, Trash2, History, Smartphone, Sparkles } from 'lucide-react';

export interface LevelHistoryItem {
  id: string;
  originalName: string;
  replacedName: string;
  worldName: string;
  worldId?: string;
  levelTitle?: string;
  targetDisplay?: string;
  timestamp: string;
  date: number;
}

interface ManageStoragePlugin {
  getLevelHistory(): Promise<{ history: LevelHistoryItem[] }>;
  saveLevelHistory(options: { history: LevelHistoryItem[] }): Promise<{ success: boolean; count: number }>;
  clearLevelHistory(): Promise<{ success: boolean }>;
}

const ManageStorage = registerPlugin<ManageStoragePlugin>('ManageStorage');

const worlds = [
  { id: 'egypt', name: 'Ancient Egypt' },
  { id: 'pirate', name: 'Pirate Seas' },
  { id: 'west', name: 'Wild West' },
  { id: 'future', name: 'Far Future' },
  { id: 'dark', name: 'Dark Ages' },
  { id: 'beach', name: 'Big Wave Beach' },
  { id: 'iceage', name: 'Frostbite Caves' },
  { id: 'city', name: 'Lost City' },
  { id: 'eighties', name: 'Neon Mixtape Tour' },
  { id: 'dino', name: 'Jurassic Marsh' },
  { id: 'modern', name: 'Modern Day' },
  { id: 'steam', name: 'Steam Ages' },
  { id: 'holiday', name: 'Holiday Mashup' },
  { id: 'carnival', name: 'Caliginous Carnival' }, 
  { id: 'roman', name: 'Roman Empire (Soon)' }
];

interface LevelFile {
  originalName: string;
  content: Blob;
  id: string;
  levelTitle?: string;
}

const extractLevelTitle = async (blob: Blob, fallbackName: string): Promise<string> => {
  try {
    const text = await blob.text();
    const data = JSON.parse(text);
    let rawName = '';
    if (data.LevelDefinition?.objdata?.Name) {
      rawName = data.LevelDefinition.objdata.Name;
    } else if (Array.isArray(data.objects)) {
      const def = data.objects.find((o: any) => o.objclass === 'LevelDefinition');
      if (def?.objdata?.Name) {
        rawName = def.objdata.Name;
      }
    } else if (Array.isArray(data)) {
      const def = data.find((o: any) => o.objclass === 'LevelDefinition');
      if (def?.objdata?.Name) {
        rawName = def.objdata.Name;
      }
    }
    if (rawName) {
      if (rawName.includes('-')) {
        const parts = rawName.split('-');
        return parts.slice(1).join('-').trim();
      }
      return rawName.trim();
    }
  } catch (e) {
    // Non-JSON or parse error
  }
  const clean = fallbackName.replace(/\.json$/i, '').trim();
  if (clean.includes('-')) {
    const parts = clean.split('-');
    return parts.slice(1).join('-').trim();
  }
  return clean;
};

const getWorldLevelLabel = (worldId: string, worldName: string, levelNum: number): string => {
  const isNight =
    worldId === 'dark' ||
    worldId === 'carnival' ||
    (worldId === 'city' && levelNum >= 33 && levelNum <= 42);
  const prefix = isNight ? 'Night' : 'Day';
  return `${worldName} - ${prefix} ${levelNum}`;
};

export default function PvZLevelSwapper() {
  const [files, setFiles] = useState<LevelFile[]>([]);
  const [selectedWorld, setSelectedWorld] = useState(worlds[0].id);
  const [levelNumber, setLevelNumber] = useState<string | number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<LevelFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');

  const [levelHistory, setLevelHistory] = useState<LevelHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('pvz_level_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const loadHistory = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await ManageStorage.getLevelHistory();
        if (res && Array.isArray(res.history)) {
          setLevelHistory(res.history);
          localStorage.setItem('pvz_level_history', JSON.stringify(res.history));
        }
      } catch (e) {
        console.warn("Failed loading level history from native prefs:", e);
      }
    }
  };

  const recordLevelSwaps = async (entries: Array<{ originalName: string; replacedName: string; levelTitle?: string; targetDisplay?: string }>) => {
    if (entries.length === 0) return;
    const currentWorldObj = worlds.find(w => w.id === selectedWorld);
    const worldName = currentWorldObj ? currentWorldObj.name : selectedWorld;
    const now = new Date();
    const timeStr = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
                    now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    const newItems: LevelHistoryItem[] = entries.map((item, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
      originalName: item.originalName,
      replacedName: item.replacedName,
      worldName,
      worldId: selectedWorld,
      levelTitle: item.levelTitle || item.originalName.replace(/\.json$/i, ''),
      targetDisplay: item.targetDisplay || item.replacedName,
      timestamp: timeStr,
      date: Date.now(),
    }));

    setLevelHistory(prev => {
      // Keep up to 30 items, newest first
      const combined = [...newItems, ...prev].slice(0, 30);
      localStorage.setItem('pvz_level_history', JSON.stringify(combined));
      if (Capacitor.isNativePlatform()) {
        ManageStorage.saveLevelHistory({ history: combined }).catch(err => {
          console.warn("Error saving history to native widget prefs:", err);
        });
      }
      return combined;
    });
  };

  const handleClearHistory = async () => {
    if (!window.confirm("Clear all tracked level history and reset the home screen widget?")) return;
    setLevelHistory([]);
    localStorage.removeItem('pvz_level_history');
    if (Capacitor.isNativePlatform()) {
      try {
        await ManageStorage.clearLevelHistory();
      } catch (err) {
        console.warn("Error clearing native history:", err);
      }
    }
  };

  const handleDeleteSingleHistory = async (id: string) => {
    const updated = levelHistory.filter(item => item.id !== id);
    setLevelHistory(updated);
    localStorage.setItem('pvz_level_history', JSON.stringify(updated));
    if (Capacitor.isNativePlatform()) {
      try {
        await ManageStorage.saveLevelHistory({ history: updated });
      } catch (err) {
        console.warn("Error saving history after single delete:", err);
      }
    }
  };

  useEffect(() => {
    loadHistory();

    const handleResume = () => {
      loadHistory();
    };
    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, []);

  const processFiles = async (uploadedFiles: File[]) => {
    setIsLoading(true);
    const newFiles: LevelFile[] = [];

    try {
      for (let file of uploadedFiles) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          const zip = new JSZip();
          const loadedZip = await zip.loadAsync(file);
          
          for (let [relativePath, zipEntry] of Object.entries(loadedZip.files)) {
            // Ignore directories, non-json files, and macOS hidden files
            if (!zipEntry.dir && relativePath.toLowerCase().endsWith('.json') && !relativePath.includes('__MACOSX')) {
              const content = await zipEntry.async('blob');
              const originalName = zipEntry.name.split('/').pop() ?? zipEntry.name;
              const title = await extractLevelTitle(content, originalName);
              newFiles.push({ originalName, content, id: Math.random().toString(36).substr(2, 9), levelTitle: title });
            }
          }
        } else if (file.name.toLowerCase().endsWith('.json')) {
          const title = await extractLevelTitle(file, file.name);
          newFiles.push({ originalName: file.name, content: file, id: Math.random().toString(36).substr(2, 9), levelTitle: title });
        }
      }

      setFiles(prev => {
        const existingNames = new Set(prev.map(f => f.originalName));
        const uniqueNew = newFiles.filter(f => !existingNames.has(f.originalName));
        return [...prev, ...uniqueNew];
      });
    } catch (error) {
      console.error("Error processing files:", error);
      alert("There was an error processing your files. Please make sure they are valid .json or .zip files.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const filesArray = Array.from(event.target.files ?? []);
    processFiles(filesArray);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const filesArray = Array.from(e.dataTransfer.files);
    processFiles(filesArray);
  };

  const removeFile = (idToRemove: string) => {
    setFiles(files.filter(f => f.id !== idToRemove));
  };

  const clearFiles = () => setFiles([]);

  const sortedFiles = [...files].sort((a, b) => a.originalName.localeCompare(b.originalName));
  const startLevelNumber = Math.max(1, parseInt(String(levelNumber), 10) || 1);

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleDownload = async () => {
    if (sortedFiles.length === 0) return;
    setIsLoading(true);

    try {
      let blob: Blob;
      let downloadName: string;

      if (sortedFiles.length === 1) {
        const file = sortedFiles[0];
        const newFileName = `${selectedWorld}${startLevelNumber}.json`;
        blob = file.content instanceof Blob ? file.content : new Blob([file.content]);
        downloadName = newFileName;
      } else {
        const zip = new JSZip();
        sortedFiles.forEach((file, index) => {
          const newFileName = `${selectedWorld}${startLevelNumber + index}.json`;
          zip.file(newFileName, file.content);
        });
        blob = await zip.generateAsync({ type: 'blob' });
        downloadName = `PvZ2_Custom_Levels_${selectedWorld}.zip`;
      }

      if (Capacitor.isNativePlatform()) {
        const base64Data = await blobToBase64(blob);
        await Filesystem.writeFile({
          path: `Download/${downloadName}`,
          data: base64Data,
          directory: Directory.ExternalStorage,
        });

        if (sortedFiles.length === 1 && sortedFiles[0].originalName.toLowerCase() !== downloadName.toLowerCase()) {
          try {
            await Filesystem.deleteFile({
              path: `Download/${sortedFiles[0].originalName}`,
              directory: Directory.ExternalStorage,
            });
          } catch {
            // File might not exist in Download
          }
        }

        alert(`Saved to Downloads/${downloadName}`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      // Record swapped levels into 30-level history & Android widget
      const currentWorldObj = worlds.find(w => w.id === selectedWorld);
      const worldName = currentWorldObj ? currentWorldObj.name : selectedWorld;
      const swapEntries = sortedFiles.map((file, index) => {
        const lvlNum = startLevelNumber + index;
        return {
          originalName: file.originalName,
          replacedName: `${selectedWorld}${lvlNum}.json`,
          levelTitle: file.levelTitle || file.originalName.replace(/\.json$/i, ''),
          targetDisplay: getWorldLevelLabel(selectedWorld, worldName, lvlNum),
        };
      });
      await recordLevelSwaps(swapEntries);
    } catch (error) {
      console.error("Error creating download:", error);
      alert("Failed to create the download.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#2c1e16] text-amber-50 p-4 sm:p-6 font-sans selection:bg-green-500/30">
      <div className="max-w-2xl mx-auto space-y-6 pb-12">
        
        {/* Header */}
        <header className="text-center space-y-2 mt-4 mb-8">
          <div className="inline-flex items-center justify-center rounded-2xl mb-2 overflow-hidden shadow-[0_0_15px_rgba(34,197,94,0.2)]">
            <img src="/Imp_Pear_ImpRFL.jpg" alt="Imp Pear" className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-amber-50 drop-shadow-md">Level Pack Swapper</h1>
          <p className="text-sm sm:text-base text-amber-200/70">Process .zip packs or multiple .json custom levels</p>
        </header>

        {/* Tool Section */}
        <section className="bg-[#1a2f1b] rounded-3xl p-4 sm:p-6 shadow-2xl border-2 border-[#2d4a22]">
          <div className="space-y-6">
            
            {/* File Upload Area */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-semibold text-green-300">1. Upload Levels (.zip or .json)</label>
                {files.length > 0 && (
                  <button onClick={clearFiles} className="text-xs font-semibold text-red-400 hover:text-red-300 flex items-center gap-1 bg-red-900/30 px-3 py-1.5 rounded-lg transition-colors border border-red-900/50">
                    <Trash2 size={14} /> Clear all
                  </button>
                )}
              </div>
              
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-10 flex flex-col items-center justify-center transition-all cursor-pointer overflow-hidden
                  ${isDragging ? 'border-green-400 bg-green-500/20' : 'border-[#4a7238] hover:border-green-400 bg-[#142415]'}
                  ${files.length > 0 ? 'border-green-500/50 bg-green-900/10' : ''}`}
              >
                <input 
                  type="file" 
                  accept=".json,.zip" 
                  multiple
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                
                {isLoading ? (
                  <div className="text-center animate-pulse">
                    <FileArchive className="w-10 h-10 mb-3 mx-auto text-amber-400" />
                    <span className="text-amber-300 font-bold block">Processing files...</span>
                  </div>
                ) : files.length > 0 ? (
                  <div className="text-center">
                    <FileJson className="w-10 h-10 mb-3 mx-auto text-green-400" />
                    <span className="text-green-300 font-bold text-lg block mb-1">{files.length} File(s) Extracted</span>
                    <span className="text-sm text-amber-200/50">Drop more to add to the list</span>
                  </div>
                ) : (
                  <div className="text-center pointer-events-none">
                    <Upload className="w-10 h-10 mb-3 mx-auto text-[#5b8a45]" />
                    <span className="text-base font-semibold block text-amber-100/90 mb-1">
                      Tap to browse or drop files
                    </span>
                    <span className="text-sm text-amber-200/60 block">
                      Accepts single/multiple .json files OR a .zip pack
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Selectors Grid */}
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Map Selection */}
              <div>
                <label className="block text-sm font-semibold text-green-300 mb-2 flex items-center gap-2">
                  <MapIcon size={16} className="text-[#5b8a45]" />
                  2. Target World
                </label>
                <div className="relative">
                  <select
                    value={selectedWorld}
                    onChange={(e) => setSelectedWorld(e.target.value)}
                    className="w-full bg-[#142415] border border-[#4a7238] rounded-xl py-3 px-4 text-amber-50 appearance-none focus:outline-none focus:ring-2 focus:ring-green-500 transition-all font-medium"
                  >
                    {worlds.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.id})</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                    <ChevronRight className="w-5 h-5 text-[#5b8a45] rotate-90" />
                  </div>
                </div>
              </div>

              {/* Level Number Selection */}
              <div>
                <label className="block text-sm font-semibold text-green-300 mb-2 flex items-center gap-2">
                  <Hash size={16} className="text-[#5b8a45]" />
                  3. Starting Level
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={levelNumber}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d+$/.test(val)) {
                      setLevelNumber(val);
                    }
                  }}
                  onBlur={() => {
                    if (levelNumber === '' || parseInt(String(levelNumber), 10) < 1) {
                      setLevelNumber(1);
                    }
                  }}
                  className="w-full bg-[#142415] border border-[#4a7238] rounded-xl py-3 px-4 text-amber-50 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all font-bold"
                />
              </div>
            </div>

            {/* Preview List */}
            {sortedFiles.length > 0 && (
              <div className="bg-[#142415] rounded-xl border border-[#2d4a22] overflow-hidden flex flex-col max-h-[300px]">
                <div className="bg-[#1a2e1c] px-4 py-2 border-b border-[#2d4a22] flex justify-between items-center sticky top-0">
                  <span className="text-xs font-bold text-green-400 uppercase tracking-wider">File Preview</span>
                  <span className="text-xs font-medium text-amber-200/50">Sorted alphabetically</span>
                </div>
                <div className="overflow-y-auto p-2 space-y-1">
                  {sortedFiles.map((file, fileIndex) => {
                    const currentWorldObj = worlds.find(w => w.id === selectedWorld);
                    const worldName = currentWorldObj ? currentWorldObj.name : selectedWorld;
                    const lvlNum = startLevelNumber + fileIndex;
                    const targetLabel = getWorldLevelLabel(selectedWorld, worldName, lvlNum);

                    const openPreview = async () => {
                      setPreviewFile(file);
                      setPreviewContent('Loading...');
                      try {
                        const text = await file.content.text();
                        setPreviewContent(JSON.stringify(JSON.parse(text), null, 2));
                      } catch (e) {
                        setPreviewContent('Error loading preview.');
                      }
                    };

                    return (
                      <div key={file.id} className="flex items-center gap-3 bg-[#1e3421] p-3 rounded-lg border border-[#2d4a22]/50 hover:bg-[#253e28] transition-colors group">
                        <FileJson size={16} className="text-amber-500/70 shrink-0 cursor-pointer hover:text-green-400" onClick={openPreview} />
                        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 sm:gap-4 text-sm cursor-pointer" onClick={openPreview}>
                          <span className="text-amber-100 truncate" title={file.levelTitle || file.originalName}>
                            {file.levelTitle || file.originalName}
                          </span>
                          <ArrowRight size={14} className="text-green-500" />
                          <span className="text-amber-200 truncate" title={file.originalName}>
                            {file.originalName}
                          </span>
                          <ArrowRight size={14} className="text-green-500" />
                          <span className="text-green-300 font-semibold truncate" title={targetLabel}>
                            {targetLabel} ({selectedWorld}{lvlNum}.json)
                          </span>
                        </div>
                        <button
                          onClick={() => removeFile(file.id)}
                          className="text-red-400/50 hover:text-red-400 transition-colors p-1"
                          title="Remove file"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preview Modal */}
            {previewFile && (() => {
              const fileIndex = sortedFiles.findIndex(f => f.id === previewFile.id);
              const currentWorldObj = worlds.find(w => w.id === selectedWorld);
              const worldName = currentWorldObj ? currentWorldObj.name : selectedWorld;
              const lvlNum = startLevelNumber + fileIndex;
              const targetLabel = getWorldLevelLabel(selectedWorld, worldName, lvlNum);

              return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setPreviewFile(null)}>
                <div className="bg-[#1a2f1b] border border-[#4a7238] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                  <div className="bg-[#142415] px-4 py-3 border-b border-[#2d4a22] flex justify-between items-center">
                    <div className="flex flex-col overflow-hidden mr-4">
                      <h3 className="font-bold text-amber-50 truncate" title={previewFile.levelTitle || previewFile.originalName}>
                        {previewFile.levelTitle || previewFile.originalName}
                      </h3>
                      <p className="text-xs text-amber-200/70 truncate" title={previewFile.originalName}>
                        {previewFile.originalName}
                      </p>
                      <p className="text-xs text-green-300 truncate font-semibold" title={targetLabel}>
                        Swapped: {targetLabel} ({selectedWorld}{lvlNum}.json)
                      </p>
                    </div>
                    <button onClick={() => setPreviewFile(null)} className="text-amber-200 hover:text-white shrink-0">
                      <X size={20} />
                    </button>
                  </div>
                  <pre className="p-4 text-xs font-mono text-green-300 overflow-auto flex-1">
                    {previewContent}
                  </pre>
                </div>
              </div>
            )})()}

            {/* Primary Action Button (Download) */}
            <div className="pt-2">
              <button
                onClick={handleDownload}
                disabled={files.length === 0 || isLoading}
                className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-200 text-lg
                  ${files.length > 0 && !isLoading
                    ? 'bg-gradient-to-b from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-[#0f1f10] shadow-[0_4px_0_rgb(21,128,61)] hover:shadow-[0_2px_0_rgb(21,128,61)] hover:translate-y-[2px] active:translate-y-[4px] active:shadow-none cursor-pointer' 
                    : 'bg-[#2d4a22] text-[#4a7238] cursor-not-allowed'}`}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2 animate-pulse">Processing...</span>
                ) : (
                  <>
                    <Download size={22} />
                    <span>
                      {files.length > 0
                        ? (files.length === 1 ? `Download Renamed File (${selectedWorld}${startLevelNumber}.json)` : `Download Renamed Pack (.zip)`)
                        : 'Download Swapped Level'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Level Swap History & Android Widget Sync (Last 30 Levels) */}
        <section className="bg-[#1a2f1b] border-2 border-[#2d4a22] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-green-500/20 text-green-400 rounded-xl border border-green-500/30 shrink-0">
                <History size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg sm:text-xl font-bold text-amber-50">
                    Recent Level Swaps
                  </h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/40">
                    {levelHistory.length}/30
                  </span>
                </div>
                <p className="text-xs text-amber-200/70">
                  Synced directly with the Android Home Screen Widget
                </p>
              </div>
            </div>

            {levelHistory.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="self-start sm:self-auto text-xs font-semibold text-red-400 hover:text-red-300 flex items-center gap-1.5 bg-red-900/20 hover:bg-red-900/40 px-3 py-1.5 rounded-lg transition-colors border border-red-900/40 cursor-pointer"
              >
                <Trash2 size={13} /> Clear History
              </button>
            )}
          </div>

          {/* Android Home Screen Widget Tip */}
          <div className="bg-[#122214] border border-[#2d5231] rounded-2xl p-3.5 flex items-start sm:items-center gap-3">
            <div className="p-2 bg-yellow-500/10 text-yellow-400 rounded-xl shrink-0 mt-0.5 sm:mt-0">
              <Smartphone size={20} />
            </div>
            <div className="text-xs space-y-0.5 flex-1">
              <p className="font-semibold text-yellow-300 flex items-center gap-1.5">
                <Sparkles size={14} className="text-yellow-400" />
                Home Screen Widget Available
              </p>
              <p className="text-amber-100/75 leading-relaxed">
                Add the <strong>Level Swaps</strong> widget (4x2) to your home screen to see which custom level was replaced!
              </p>
            </div>
          </div>

          {/* History List Matching Widget Layout */}
          {levelHistory.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {levelHistory.map((item) => {
                const customTitle = item.levelTitle || item.originalName.replace(/\.json$/i, '');
                const targetTitle = item.targetDisplay || item.replacedName;

                return (
                  <div
                    key={item.id}
                    className="bg-[#616161] text-white px-3.5 py-2.5 rounded-2xl flex items-center justify-between gap-2 text-xs sm:text-sm font-medium shadow-sm hover:bg-[#6e6e6e] transition-colors"
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="truncate max-w-[30%] font-medium" title={customTitle}>
                        {customTitle}
                      </span>
                      <span className="text-stone-300 text-xs shrink-0">-&gt;</span>
                      <span className="truncate max-w-[30%] font-medium" title={item.originalName}>
                        {item.originalName}
                      </span>
                      <span className="text-stone-300 text-xs shrink-0">-&gt;</span>
                      <span className="truncate max-w-[30%] font-semibold text-green-200" title={targetTitle}>
                        {targetTitle}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteSingleHistory(item.id)}
                      className="text-stone-200 hover:text-red-400 p-1 rounded-lg transition-colors cursor-pointer shrink-0"
                      title="Delete from history & widget"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 px-4 bg-[#122214]/60 rounded-2xl border border-dashed border-[#2d4a22]">
              <History className="w-8 h-8 mx-auto text-amber-400/40 mb-2" />
              <p className="text-xs font-semibold text-amber-200/70">
                No level swaps recorded yet
              </p>
              <p className="text-[11px] text-amber-200/50 mt-0.5">
                When you download renamed levels, the last 30 will appear here and on your home screen widget.
              </p>
            </div>
          )}
        </section>

        {/* Guide Section */}
        <section className="bg-[#3e2719] rounded-3xl p-5 sm:p-6 border-2 border-[#543522] shadow-inner mt-6">
          <h2 className="text-xl font-bold text-amber-400 flex items-center gap-2 mb-5">
            <Info size={24} className="text-amber-500" />
            4. Installation Guide
          </h2>
          
          <div className="space-y-4 text-sm sm:text-base text-amber-100/90">
            <div className="bg-[#2c1e16] p-4 sm:p-5 rounded-xl border border-[#4a2e1d] shadow-md">
              <p className="font-bold text-amber-300 mb-2 text-lg">Manual Installation (via ZArchiver)</p>
              <p className="text-sm mb-2">Tap <strong>Download</strong> above, then use a file manager like <strong>ZArchiver</strong> to move the downloaded file to:</p>
              <code className="block bg-black/60 text-green-400 p-3.5 rounded-lg text-xs sm:text-sm break-words font-mono border border-black/80">
                Android/data/com.ea.game.pvz2_rfl/files/No_Backup/CDN.[Version]/levels
              </code>
              <p className="text-xs text-amber-400/60 mt-2">* Always use the highest numbered CDN folder you see.</p>
            </div>
            
            <div className="bg-[#2c1e16] p-4 sm:p-5 rounded-xl border border-[#4a2e1d] shadow-md border-l-4 border-l-green-500">
              <p className="font-bold text-green-400 mb-1 text-lg">Ready to Play!</p>
              <p>Open the game and navigate to the selected world. Your custom levels will automatically start at your chosen Day number.</p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}