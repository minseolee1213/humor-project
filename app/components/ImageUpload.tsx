'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  generatePresignedUrl,
  uploadToS3,
  registerImage,
  generateCaptions,
  isValidImageType,
  formatFileSize,
  type Caption,
} from '@/lib/pipeline/client';
import { revalidateHome } from '@/app/actions/revalidate';

type UploadStep = 
  | 'idle'
  | 'getting-url'
  | 'uploading'
  | 'registering'
  | 'generating'
  | 'selecting'
  | 'success'
  | 'error';

interface ImageUploadProps {
  onSuccess?: (imageId: string, captions: Caption[]) => void;
}

export default function ImageUpload({ onSuccess }: ImageUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [step, setStep] = useState<UploadStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [imageId, setImageId] = useState<string | null>(null);
  const [selectedCaptionId, setSelectedCaptionId] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const router = useRouter();

  const resetState = useCallback(() => {
    setFile(null);
    setPreview(null);
    setStep('idle');
    setError(null);
    setCaptions([]);
    setImageId(null);
    setSelectedCaptionId(null);
    setIsRegenerating(false);
  }, []);

  const handleFileSelect = useCallback((selectedFile: File) => {
    // Validate file type
    if (!isValidImageType(selectedFile)) {
      setError(`Unsupported file type: ${selectedFile.type}. Supported types: JPEG, PNG, WebP, GIF, HEIC`);
      setStep('error');
      return;
    }

    // Validate file size (optional: limit to 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (selectedFile.size > maxSize) {
      setError(`File size too large: ${formatFileSize(selectedFile.size)}. Maximum size: ${formatFileSize(maxSize)}`);
      setStep('error');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setStep('idle');

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(selectedFile);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Please select a file first');
      setStep('error');
      return;
    }

    try {
      setError(null);
      setCaptions([]);
      setImageId(null);

      // Step 1: Generate presigned URL
      setStep('getting-url');
      const { presignedUrl, cdnUrl } = await generatePresignedUrl(file.type);

      // Step 2: Upload to S3
      setStep('uploading');
      await uploadToS3(presignedUrl, file);

      // Step 3: Register image
      setStep('registering');
      const { imageId: newImageId } = await registerImage(cdnUrl, false);
      setImageId(newImageId);

      // Step 4: Generate captions
      setStep('generating');
      const generatedCaptions = await generateCaptions(newImageId);
      setCaptions(generatedCaptions);
      setSelectedCaptionId(null); // Clear selection when new captions are generated

      // Move to selection step
      setStep('selecting');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      setStep('error');
      console.error('Upload error:', err);
    }
  }, [file, onSuccess, router]);

  const handleRegenerate = useCallback(async () => {
    if (!imageId || isRegenerating) return;

    try {
      setIsRegenerating(true);
      setSelectedCaptionId(null);
      setStep('generating');
      const generatedCaptions = await generateCaptions(imageId);
      setCaptions(generatedCaptions);
      setStep('selecting');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to regenerate captions';
      setError(errorMessage);
      setStep('error');
    } finally {
      setIsRegenerating(false);
    }
  }, [imageId, isRegenerating]);

  const handleDone = useCallback(async () => {
    if (!selectedCaptionId || !imageId) return;

    try {
      // Save selection to localStorage
      localStorage.setItem(`selectedCaption:${imageId}`, selectedCaptionId);

      // Call success callback if provided
      if (onSuccess) {
        const selectedCaption = captions.find(c => c.id === selectedCaptionId);
        if (selectedCaption) {
          onSuccess(imageId, [selectedCaption]);
        }
      }

      // Revalidate and navigate to home (Meme TV deck)
      await revalidateHome();
      router.push('/');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save selection';
      setError(errorMessage);
      setStep('error');
    }
  }, [selectedCaptionId, imageId, captions, onSuccess, router]);

  const getStepMessage = () => {
    switch (step) {
      case 'getting-url':
        return 'Getting upload URL...';
      case 'uploading':
        return 'Uploading to S3...';
      case 'registering':
        return 'Registering image...';
      case 'generating':
        return 'Generating captions...';
      case 'selecting':
        return 'Choose a caption';
      case 'success':
        return 'Upload successful!';
      case 'error':
        return 'Upload failed';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* File Upload Area */}
      {step !== 'selecting' && (
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic"
          onChange={handleFileInputChange}
          className="hidden"
        />
        
        {!file ? (
          <div className="space-y-4">
            <div className="text-4xl">📷</div>
            <div>
              <p className="text-lg font-medium text-foreground mb-2">
                Drag and drop an image here, or click to select
              </p>
              <p className="text-sm text-foreground/60 mb-4">
                Supported formats: JPEG, PNG, WebP, GIF, HEIC
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Choose File
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-4xl">✅</div>
            <div>
              <p className="text-lg font-medium text-foreground mb-1">
                {file.name}
              </p>
              <p className="text-sm text-foreground/60">
                {formatFileSize(file.size)}
              </p>
            </div>
            {preview && (
              <div className="mt-4 max-w-md mx-auto">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-auto rounded-lg shadow-md"
                />
              </div>
            )}
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Change File
              </button>
              <button
                onClick={resetState}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Upload Button */}
      {file && step !== 'success' && step !== 'selecting' && (
        <div className="flex justify-center">
          <button
            onClick={handleUpload}
            disabled={step !== 'idle' && step !== 'error'}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              step !== 'idle' && step !== 'error'
                ? 'bg-gray-400 dark:bg-gray-600 text-gray-200 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {step === 'idle' || step === 'error' ? 'Upload & Generate Captions' : getStepMessage()}
          </button>
        </div>
      )}

      {/* Progress Steps */}
      {step !== 'idle' && step !== 'error' && step !== 'selecting' && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <div className="space-y-2">
            <div className={`flex items-center gap-2 ${step === 'getting-url' ? 'font-semibold' : ''}`}>
              <span>{step === 'getting-url' ? '⏳' : step === 'success' ? '✅' : '✓'}</span>
              <span>Getting upload URL...</span>
            </div>
            {step !== 'getting-url' && (
              <div className={`flex items-center gap-2 ${step === 'uploading' ? 'font-semibold' : ''}`}>
                <span>{step === 'uploading' ? '⏳' : step === 'success' ? '✅' : '✓'}</span>
                <span>Uploading to S3...</span>
              </div>
            )}
            {step !== 'getting-url' && step !== 'uploading' && (
              <div className={`flex items-center gap-2 ${step === 'registering' ? 'font-semibold' : ''}`}>
                <span>{step === 'registering' ? '⏳' : step === 'success' ? '✅' : '✓'}</span>
                <span>Registering image...</span>
              </div>
            )}
            {step !== 'getting-url' && step !== 'uploading' && step !== 'registering' && (
              <div className={`flex items-center gap-2 ${step === 'generating' ? 'font-semibold' : ''}`}>
                <span>{step === 'generating' ? '⏳' : step === 'success' ? '✅' : '✓'}</span>
                <span>Generating captions...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200 font-medium mb-1">Error</p>
          <p className="text-red-600 dark:text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Caption Selection UI */}
      {step === 'selecting' && preview && captions.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-3xl font-bold text-foreground text-center" style={{ fontFamily: 'var(--font-fredoka)', fontWeight: 600 }}>
            Choose a Caption
          </h2>
          
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left: Image Preview */}
            <div className="flex-shrink-0 lg:w-1/2">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4">
                <img
                  src={preview}
                  alt="Uploaded image"
                  className="w-full h-auto rounded-xl object-cover"
                />
              </div>
            </div>

            {/* Right: Caption Options */}
            <div className="flex-1 lg:w-1/2">
              <div className="space-y-3">
                {captions.map((caption) => {
                  const isSelected = selectedCaptionId === caption.id;
                  return (
                    <button
                      key={caption.id}
                      onClick={() => setSelectedCaptionId(caption.id)}
                      className={`w-full text-left p-4 rounded-xl transition-all ${
                        isSelected
                          ? 'bg-purple-100 dark:bg-purple-900/30 border-2 border-purple-500 shadow-md'
                          : 'bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-sm'
                      }`}
                    >
                      <p className={`text-lg font-medium ${
                        isSelected
                          ? 'text-purple-900 dark:text-purple-100'
                          : 'text-foreground'
                      }`} style={{ fontFamily: 'var(--font-poppins)', fontWeight: 500 }}>
                        {caption.content || 'No caption text'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <button
              onClick={handleDone}
              disabled={!selectedCaptionId}
              className={`px-8 py-3 rounded-xl font-semibold transition-all ${
                selectedCaptionId
                  ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md hover:shadow-lg'
                  : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }`}
              style={{ fontFamily: 'var(--font-poppins)', fontWeight: 600 }}
            >
              Done
            </button>
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="px-8 py-3 rounded-xl font-semibold bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-foreground transition-all"
              style={{ fontFamily: 'var(--font-poppins)', fontWeight: 600 }}
            >
              {isRegenerating ? 'Regenerating...' : 'Regenerate'}
            </button>
            <button
              onClick={resetState}
              className="px-8 py-3 rounded-xl font-semibold bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-foreground transition-all"
              style={{ fontFamily: 'var(--font-poppins)', fontWeight: 600 }}
            >
              New Image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
