import React, { useState, useEffect, useMemo } from 'react';
import { Attachment } from '../../types';
import {
  X,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileText,
  Image as ImageIcon,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  AlertCircle,
  Maximize2,
  File
} from 'lucide-react';

export interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: Attachment | { name: string; url?: string; size?: number; type?: string; uploadedAt?: string } | null;
  onDownload?: (file: Attachment | { name: string; url?: string; size?: number; type?: string }) => void;
}

export default function FilePreviewModal({
  isOpen,
  onClose,
  file,
  onDownload
}: FilePreviewModalProps) {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);
  const [pdfLoadError, setPdfLoadError] = useState<boolean>(false);

  // Reset zoom and error states when opening a new file
  useEffect(() => {
    if (isOpen && file) {
      setZoomLevel(100);
      setImageLoaded(false);
      setImageError(false);
      setPdfLoadError(false);
    }
  }, [isOpen, file]);

  // Keyboard shortcut: Esc to close, +/- to zoom if image
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.key === '+' || e.key === '=') && isImage) {
        e.preventDefault();
        setZoomLevel((prev) => Math.min(prev + 25, 300));
      } else if (e.key === '-' && isImage) {
        e.preventDefault();
        setZoomLevel((prev) => Math.max(prev - 25, 25));
      } else if (e.key === '0' && isImage) {
        e.preventDefault();
        setZoomLevel(100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Detect file format category
  const { isImage, isPdf, isDoc, isArchive, fileExtension, formattedSize } = useMemo(() => {
    if (!file) {
      return { isImage: false, isPdf: false, isDoc: false, isArchive: false, fileExtension: '', formattedSize: '—' };
    }

    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    const url = (file.url || '').toLowerCase();

    const extMatch = name.match(/\.([0-9a-z]+)(?:[?#]|$)/i);
    const ext = extMatch ? extMatch[1].toUpperCase() : '';

    const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/bmp'];
    const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'];
    const checkIsImage =
      imageTypes.some((t) => type.includes(t)) ||
      imageExtensions.some((e) => name.endsWith(`.${e}`) || url.includes(`.${e}`)) ||
      url.startsWith('data:image/');

    const checkIsPdf =
      type.includes('pdf') ||
      name.endsWith('.pdf') ||
      url.includes('.pdf') ||
      url.startsWith('data:application/pdf');

    const checkIsArchive = ['zip', 'rar', '7z', 'tar', 'gz'].some((e) => name.endsWith(`.${e}`));
    const checkIsDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'dwg'].some((e) => name.endsWith(`.${e}`));

    // Formatted file size
    let sizeStr = '—';
    if (typeof file.size === 'number' && file.size > 0) {
      if (file.size < 1024) {
        sizeStr = `${file.size} B`;
      } else if (file.size < 1024 * 1024) {
        sizeStr = `${(file.size / 1024).toFixed(1)} KB`;
      } else {
        sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
      }
    }

    return {
      isImage: checkIsImage,
      isPdf: checkIsPdf,
      isDoc: checkIsDoc,
      isArchive: checkIsArchive,
      fileExtension: ext || (checkIsPdf ? 'PDF' : checkIsImage ? 'IMAGE' : 'FILE'),
      formattedSize: sizeStr
    };
  }, [file]);

  if (!isOpen || !file) return null;

  const handleDownload = () => {
    if (onDownload) {
      onDownload(file);
      return;
    }

    if (file.url) {
      const link = document.createElement('a');
      link.href = file.url;
      link.download = file.name || 'attachment';
      link.target = '_blank';
      link.rel = 'noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleOpenExternal = () => {
    if (file.url) {
      window.open(file.url, '_blank', 'noreferrer');
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-preview-title"
    >
      {/* Top Navigation / Controls Bar */}
      <div className="h-16 px-4 md:px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0 shadow-lg select-none">
        {/* File Details & Badges */}
        <div className="flex items-center space-x-3 truncate max-w-[50%] md:max-w-[60%]">
          <div className="p-2 rounded-lg bg-slate-800 text-blue-400 border border-slate-700 shrink-0">
            {isImage ? (
              <ImageIcon className="w-4 h-4" />
            ) : isPdf ? (
              <FileText className="w-4 h-4 text-red-400" />
            ) : isArchive ? (
              <FileArchive className="w-4 h-4 text-amber-400" />
            ) : isDoc ? (
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            ) : (
              <File className="w-4 h-4 text-slate-300" />
            )}
          </div>
          <div className="truncate">
            <h3 id="file-preview-title" className="text-sm font-semibold text-white truncate" title={file.name}>
              {file.name}
            </h3>
            <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono">
              <span className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 font-bold">
                {fileExtension}
              </span>
              <span>•</span>
              <span>{formattedSize}</span>
              {file.uploadedAt && (
                <>
                  <span>•</span>
                  <span>{new Date(file.uploadedAt).toLocaleDateString()}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Zoom controls for image */}
          {isImage && (
            <div className="hidden sm:flex items-center space-x-1 bg-slate-800 border border-slate-700 rounded-lg p-1 mr-2 text-slate-300">
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.max(prev - 25, 25))}
                disabled={zoomLevel <= 25}
                className="p-1 hover:text-white hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                className="px-2 py-0.5 text-xs font-mono hover:text-white rounded hover:bg-slate-700 transition cursor-pointer"
                title="Reset Zoom (100%)"
              >
                {zoomLevel}%
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.min(prev + 25, 300))}
                disabled={zoomLevel >= 300}
                className="p-1 hover:text-white hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                className="p-1 hover:text-white hover:bg-slate-700 rounded transition cursor-pointer text-slate-400 hover:text-slate-200"
                title="Reset (0)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Open in New Window */}
          {file.url && (
            <button
              type="button"
              onClick={handleOpenExternal}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700 transition flex items-center justify-center cursor-pointer"
              title="Open raw file in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          {/* Direct Download Button */}
          {file.url && (
            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-blue-900/30 transition cursor-pointer"
              title="Download local copy"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
          )}

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer ml-1"
            title="Close Preview (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Preview Viewport */}
      <div 
        className="flex-1 overflow-auto flex items-center justify-center p-2 sm:p-6"
        onClick={(e) => {
          // Close modal if user clicks on the dark backdrop itself
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        {/* CASE 1: Image Viewer */}
        {isImage && file.url && !imageError && (
          <div className="relative flex items-center justify-center max-w-full max-h-full">
            {!imageLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 space-y-2">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-mono">Loading image...</span>
              </div>
            )}
            <img
              src={file.url}
              alt={file.name}
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                setImageLoaded(true);
                setImageError(true);
              }}
              style={{
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out',
                maxWidth: zoomLevel === 100 ? '90vw' : 'none',
                maxHeight: zoomLevel === 100 ? '80vh' : 'none'
              }}
              className={`rounded-lg shadow-2xl object-contain select-none cursor-zoom-in ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                // Toggle between 100% and 150% on single click
                setZoomLevel((prev) => (prev === 100 ? 150 : 100));
              }}
            />
          </div>
        )}

        {/* CASE 2: PDF Document Viewer */}
        {isPdf && file.url && !pdfLoadError && (
          <div className="w-full h-full max-w-6xl max-h-[86vh] flex flex-col rounded-xl overflow-hidden bg-white shadow-2xl border border-slate-700">
            <iframe
              src={`${file.url}#view=FitH`}
              title={file.name}
              className="w-full h-full border-0 bg-white"
              onError={() => setPdfLoadError(true)}
            />
          </div>
        )}

        {/* CASE 3: Fallback for Non-Embeddable Formats (ZIP, DOCX, XLSX, DWG, or load errors) */}
        {(!isImage && !isPdf) || imageError || pdfLoadError || !file.url ? (
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl space-y-5 animate-in zoom-in-95 duration-150"
          >
            <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-blue-400">
              {isArchive ? (
                <FileArchive className="w-8 h-8 text-amber-400" />
              ) : isDoc ? (
                <FileSpreadsheet className="w-8 h-8 text-emerald-400" />
              ) : imageError || pdfLoadError ? (
                <AlertCircle className="w-8 h-8 text-red-400" />
              ) : (
                <File className="w-8 h-8 text-slate-300" />
              )}
            </div>

            <div className="space-y-1.5">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                {fileExtension} FORMAT
              </span>
              <h4 className="text-base font-bold text-white truncate" title={file.name}>
                {file.name}
              </h4>
              <p className="text-xs text-slate-400 font-mono">
                {formattedSize} {file.type ? `• ${file.type}` : ''}
              </p>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {imageError || pdfLoadError
                ? 'Embedded preview could not be displayed due to browser security restrictions or invalid file stream. Please download the file to inspect it.'
                : `In-browser interactive preview is not supported for .${fileExtension.toLowerCase()} files. You can securely download this attachment to inspect it in your native desktop software.`}
            </p>

            <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
              {file.url ? (
                <>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-blue-900/40 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download File ({formattedSize})</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenExternal}
                    className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium border border-slate-700 transition flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Tab</span>
                  </button>
                </>
              ) : (
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs">
                  This attachment has no stored remote URL.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
