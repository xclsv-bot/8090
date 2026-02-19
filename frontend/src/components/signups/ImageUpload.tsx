'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Upload, X, RefreshCw, Check, AlertCircle, Image as ImageIcon, Loader2 } from 'lucide-react';

interface ImageUploadProps {
  onUpload: (base64: string, contentType: string) => void;
  onClear?: () => void;
  maxSizeMB?: number;
  compressionQuality?: number;
  maxWidth?: number;
  maxHeight?: number;
  accept?: string;
  disabled?: boolean;
  className?: string;
}

type UploadStatus = 'idle' | 'compressing' | 'uploading' | 'success' | 'error';

export function ImageUpload({
  onUpload,
  onClear,
  maxSizeMB = 5,
  compressionQuality = 0.8,
  maxWidth = 1920,
  maxHeight = 1920,
  accept = 'image/jpeg,image/png,image/heic,image/heif',
  disabled = false,
  className = '',
}: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [originalSize, setOriginalSize] = useState<number>(0);
  const [compressedSize, setCompressedSize] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressImage = useCallback(async (file: File): Promise<{ base64: string; contentType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Calculate new dimensions while maintaining aspect ratio
          let { width, height } = img;
          
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          // Create canvas for compression
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          // Draw image
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to JPEG for better compression
          const contentType = 'image/jpeg';
          const base64 = canvas.toDataURL(contentType, compressionQuality);
          
          // Calculate compressed size (base64 is ~33% larger than binary)
          const compressedBytes = Math.round((base64.length - 'data:image/jpeg;base64,'.length) * 0.75);
          setCompressedSize(compressedBytes);
          
          resolve({ base64, contentType });
        };
        
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }, [compressionQuality, maxWidth, maxHeight]);

  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);
    setProgress(0);
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
    if (!validTypes.includes(file.type)) {
      setError('Please select a JPEG, PNG, or HEIC image');
      return;
    }

    // Validate file size
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File size must be less than ${maxSizeMB}MB`);
      return;
    }

    setOriginalSize(file.size);
    setStatus('compressing');
    setProgress(20);

    try {
      // Compress image
      const { base64, contentType } = await compressImage(file);
      setProgress(60);
      
      // Set preview
      setPreview(base64);
      setProgress(80);
      
      setStatus('uploading');
      
      // Call upload handler
      onUpload(base64, contentType);
      
      setProgress(100);
      setStatus('success');
    } catch (err) {
      console.error('Image upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process image');
      setStatus('error');
    }
  }, [compressImage, maxSizeMB, onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [disabled, handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleClear = useCallback(() => {
    setPreview(null);
    setStatus('idle');
    setError(null);
    setProgress(0);
    setOriginalSize(0);
    setCompressedSize(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClear?.();
  }, [onClear]);

  const handleRetry = useCallback(() => {
    if (fileInputRef.current?.files?.[0]) {
      handleFileSelect(fileInputRef.current.files[0]);
    } else {
      handleClear();
    }
  }, [handleFileSelect, handleClear]);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const compressionRatio = originalSize > 0 && compressedSize > 0
    ? Math.round((1 - compressedSize / originalSize) * 100)
    : 0;

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />

      {!preview ? (
        <Card
          className={`
            border-2 border-dashed p-8 text-center cursor-pointer transition-colors
            ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:border-blue-400 hover:bg-blue-50/50'}
            ${error ? 'border-red-300 bg-red-50' : 'border-gray-300'}
          `}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-3">
            {status === 'compressing' ? (
              <>
                <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                <p className="text-sm text-gray-600">Compressing image...</p>
              </>
            ) : (
              <>
                <Upload className={`h-10 w-10 ${error ? 'text-red-400' : 'text-gray-400'}`} />
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Drop bet slip photo here or click to browse
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    JPEG, PNG, or HEIC up to {maxSizeMB}MB
                  </p>
                </div>
              </>
            )}
            
            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm mt-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="relative">
            {/* Preview Image */}
            <div className="relative rounded-lg overflow-hidden bg-gray-100">
              <img
                src={preview}
                alt="Bet slip preview"
                className="w-full h-auto max-h-64 object-contain"
              />
              
              {/* Status overlay */}
              {status === 'uploading' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="text-white text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                    <p className="text-sm mt-2">Uploading...</p>
                  </div>
                </div>
              )}
              
              {status === 'success' && (
                <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1">
                  <Check className="h-4 w-4 text-white" />
                </div>
              )}
            </div>

            {/* Progress bar */}
            {(status === 'compressing' || status === 'uploading') && (
              <div className="mt-2">
                <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1 text-center">
                  {status === 'compressing' ? 'Compressing...' : 'Uploading...'} {progress}%
                </p>
              </div>
            )}

            {/* Compression info */}
            {status === 'success' && compressionRatio > 0 && (
              <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
                <span>
                  {formatBytes(originalSize)} → {formatBytes(compressedSize)}
                </span>
                <span className="text-green-600">
                  {compressionRatio}% smaller
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={status === 'uploading' || status === 'compressing'}
                className="flex-1"
              >
                <X className="h-4 w-4 mr-1" />
                Remove
              </Button>
              
              {status === 'error' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  className="flex-1"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Retry
                </Button>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div className="mt-2 flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

export default ImageUpload;
