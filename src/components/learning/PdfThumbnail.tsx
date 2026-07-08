'use client';

import { useEffect, useRef, useState } from 'react';
import { FileEdit } from 'lucide-react';

interface PdfThumbnailProps {
  url: string;
  className?: string;
}

export default function PdfThumbnail({ url, className = '' }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const renderThumbnail = async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch PDF');

        const arrayBuffer = await response.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Scale to fit the card width while keeping aspect ratio
        const targetWidth = 300;
        const viewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const context = canvas.getContext('2d');
        if (!context) return;

        await page.render({
          canvasContext: context,
          canvas: canvas,
          viewport: scaledViewport,
        }).promise;

        if (!cancelled) setLoaded(true);
      } catch (err) {
        console.error('PDF thumbnail error:', err);
        if (!cancelled) setError(true);
      }
    };

    renderThumbnail();

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Fallback icon if loading fails
  if (error) {
    return (
      <div className={`flex items-center justify-center bg-[#E8E3DA] ${className}`}>
        <FileEdit size={36} className="text-[#8B7B5E] opacity-50" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-[#E8E3DA] ${className}`}>
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-cover object-top transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ display: 'block' }}
      />
      {/* Loading shimmer while rendering */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#8B7B5E] border-t-transparent rounded-full animate-spin opacity-30" />
        </div>
      )}
    </div>
  );
}