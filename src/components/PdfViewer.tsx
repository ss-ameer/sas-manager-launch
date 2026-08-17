import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, AlertCircle } from 'lucide-react';

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

interface PdfViewerProps {
  pdfUrl: string;
  className?: string;
}

let pdfjsLoadingPromise: Promise<any> | null = null;

function loadPdfJs(): Promise<any> {
  if (pdfjsLoadingPromise) return pdfjsLoadingPromise;

  pdfjsLoadingPromise = new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      } else {
        reject(new Error('PDF.js loaded but pdfjsLib is not defined on window'));
      }
    };
    script.onerror = () => {
      pdfjsLoadingPromise = null; // allow retry on network failure
      reject(new Error('Failed to load PDF.js from Cloudflare CDN'));
    };
    document.body.appendChild(script);
  });

  return pdfjsLoadingPromise;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ pdfUrl, className = '' }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.0);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<any>(null);
  const activeRenderTaskRef = useRef<any>(null);

  // Load PDF.js and initialize document
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setCurrentPage(1);

    const initializePdf = async () => {
      try {
        const pdfjs = await loadPdfJs();
        if (!active) return;

        let loadingTask;
        if (pdfUrl.startsWith('data:')) {
          // Parse base64 string directly into Uint8Array for zero-network execution safety
          const base64Index = pdfUrl.indexOf(';base64,');
          if (base64Index !== -1) {
            const base64Data = pdfUrl.substring(base64Index + 8);
            const binaryString = window.atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            loadingTask = pdfjs.getDocument({ data: bytes });
          } else {
            loadingTask = pdfjs.getDocument(pdfUrl);
          }
        } else {
          loadingTask = pdfjs.getDocument(pdfUrl);
        }

        const pdfDoc = await loadingTask.promise;
        if (!active) return;

        pdfDocRef.current = pdfDoc;
        setNumPages(pdfDoc.numPages);
        setLoading(false);
      } catch (err: any) {
        console.error('Error loading PDF document:', err);
        if (active) {
          setError(err.message || 'Failed to parse PDF document.');
          setLoading(false);
        }
      }
    };

    initializePdf();

    return () => {
      active = false;
      if (activeRenderTaskRef.current) {
        activeRenderTaskRef.current.cancel();
      }
    };
  }, [pdfUrl]);

  // Render specific page on canvas
  useEffect(() => {
    if (loading || error || !pdfDocRef.current || !canvasRef.current) return;

    let active = true;

    const renderPage = async () => {
      try {
        // Cancel any active render task before drawing a new page/zoom level
        if (activeRenderTaskRef.current) {
          activeRenderTaskRef.current.cancel();
          activeRenderTaskRef.current = null;
        }

        const page = await pdfDocRef.current.getPage(currentPage);
        if (!active) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Calculate responsive viewport scale
        const containerWidth = containerRef.current?.clientWidth || 600;
        const baseViewport = page.getViewport({ scale: 1.0 });
        
        // Base fit-to-width factor
        const widthScale = (containerWidth - 32) / baseViewport.width;
        const optimalScale = Math.min(widthScale * zoom, 2.5); // cap maximum rendering zoom

        const viewport = page.getViewport({ scale: optimalScale });

        // Set high-DPI scaling for ultra-crisp document rendering (Retina/4K support)
        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.scale(dpr, dpr);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        const renderTask = page.render(renderContext);
        activeRenderTaskRef.current = renderTask;

        await renderTask.promise;
        if (active) {
          activeRenderTaskRef.current = null;
        }
      } catch (err: any) {
        if (err.name === 'RenderingCancelledException' || err.message?.includes('cancelled')) {
          // Expected behavior when zooming or paging rapidly
        } else {
          console.error('Error rendering PDF page:', err);
        }
      }
    };

    renderPage();

    return () => {
      active = false;
    };
  }, [currentPage, zoom, loading, error]);

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, numPages));
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 2.5));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  };

  return (
    <div 
      ref={containerRef}
      className={`flex flex-col w-full h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-inner ${className}`}
    >
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-slate-950 border-b border-slate-800 select-none shrink-0 text-white text-xs">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || loading || !!error}
            className="p-1 hover:bg-slate-800 active:bg-slate-700 rounded disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4 text-slate-300" />
          </button>
          <span className="font-mono text-slate-300 whitespace-nowrap">
            {loading ? '...' : `Page ${currentPage} / ${numPages}`}
          </span>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentPage >= numPages || loading || !!error}
            className="p-1 hover:bg-slate-800 active:bg-slate-700 rounded disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5 || loading || !!error}
            className="p-1 hover:bg-slate-800 active:bg-slate-700 rounded disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4 text-slate-300" />
          </button>
          <span className="font-mono text-slate-300 w-12 text-center select-none">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 2.5 || loading || !!error}
            className="p-1 hover:bg-slate-800 active:bg-slate-700 rounded disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div className="flex-1 overflow-auto p-4 flex items-start justify-center min-h-0 bg-slate-900/60 relative">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 bg-slate-950/80 z-10">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-xs font-semibold text-slate-300">Rendering document inline...</p>
          </div>
        )}

        {error ? (
          <div className="text-center p-6 bg-slate-950/60 border border-red-900/50 rounded-xl max-w-sm my-auto text-slate-200">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <p className="text-xs font-bold font-sans text-red-400">PDF Rendering Failed</p>
            <p className="text-[11px] text-slate-400 mt-2 mb-4 leading-relaxed font-mono text-left bg-slate-900/80 p-2.5 rounded border border-slate-800 max-h-36 overflow-y-auto">
              {error}
            </p>
            <p className="text-xs text-slate-400">
              This sandbox environment or browser security constraints may limit PDF.js. Please use the secondary option below to view:
            </p>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg transition shadow-md"
            >
              <span>Open raw document in New Tab</span>
            </a>
          </div>
        ) : (
          <div className="transition-all duration-150 inline-block bg-white rounded-md shadow-2xl p-1">
            <canvas 
              ref={canvasRef} 
              className="rounded-sm block max-w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
};
