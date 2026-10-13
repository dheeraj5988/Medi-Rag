import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  X,
  Image as ImageIcon,
  RotateCcw,
  Check,
  AlertCircle,
  FlipHorizontal,
} from 'lucide-react';

export interface ImageAttachment {
  base64: string;
  mimeType: string;
  previewUrl: string;
  fileName: string;
}

interface ImageCaptureControlProps {
  image: ImageAttachment | null;
  onImageChange: (image: ImageAttachment | null) => void;
  compact?: boolean;
  label?: string;
}

export const ImageCaptureControl: React.FC<ImageCaptureControlProps> = ({
  image,
  onImageChange,
  compact = false,
  label = 'Attach Skin / Rash Photo',
}) => {
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [streamActive, setStreamActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera media tracks
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStreamActive(false);
  };

  // Start live webcam / camera stream
  const startCameraStream = async (mode: 'environment' | 'user') => {
    stopCameraStream();
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setStreamActive(true);
    } catch (err: unknown) {
      console.warn('Camera stream error, falling back to basic camera input:', err);
      // Try with any video constraints
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.play();
        }
        setStreamActive(true);
      } catch (fallbackErr) {
        setCameraError(
          'Live camera preview could not be opened. You can still use the "Native Camera Capture" button below.'
        );
      }
    }
  };

  // Handle open camera modal
  const handleOpenCameraModal = async () => {
    setShowCameraModal(true);
    await startCameraStream(facingMode);
  };

  // Close camera modal
  const handleCloseCameraModal = () => {
    stopCameraStream();
    setShowCameraModal(false);
  };

  // Switch facing mode (front/back camera)
  const handleFlipCamera = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    await startCameraStream(nextMode);
  };

  // Snap photo from live video canvas
  const handleSnapPhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const base64 = dataUrl.split(',')[1];

    onImageChange({
      base64,
      mimeType: 'image/jpeg',
      previewUrl: dataUrl,
      fileName: `camera_skin_photo_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.jpg`,
    });

    handleCloseCameraModal();
  };

  // Handle file selected from PC or gallery
  const processSelectedFile = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPEG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        const base64 = dataUrl.split(',')[1];
        onImageChange({
          base64,
          mimeType: file.type || 'image/jpeg',
          previewUrl: dataUrl,
          fileName: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  return (
    <div className="space-y-2">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) processSelectedFile(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={mobileCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) processSelectedFile(e.target.files[0]);
          e.target.value = '';
        }}
      />

      {/* If an image is currently attached, show preview thumbnail */}
      {image ? (
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 animate-in fade-in duration-150">
          <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-teal-300 dark:border-teal-800 bg-black shrink-0">
            <img
              src={image.previewUrl}
              alt="Attached skin photo"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-teal-900 dark:text-teal-200 truncate">
                {image.fileName}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-teal-200 dark:bg-teal-900 text-teal-800 dark:text-teal-300">
                Skin Photo Attached
              </span>
            </div>
            <p className="text-[11px] text-teal-700 dark:text-teal-400 mt-0.5">
              Gemini will visually analyze morphology (color, pattern, borders) alongside clinical RAG guidelines.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onImageChange(null)}
            className="p-1.5 text-teal-700 hover:text-rose-600 dark:text-teal-300 dark:hover:text-rose-400 rounded-md hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors shrink-0"
            title="Remove skin photo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : compact ? (
        /* Compact Button Strip (for Chat Input) */
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Upload skin image from computer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Photo</span>
          </button>
          <button
            type="button"
            onClick={handleOpenCameraModal}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Take skin photo with camera"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Use Camera</span>
          </button>
        </div>
      ) : (
        /* Full Section Control (for Symptom Checker) */
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {label} (Optional)
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              Camera or PC Upload · JPEG / PNG / WebP
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleOpenCameraModal}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-teal-800 dark:text-teal-300 text-xs font-semibold shadow-xs transition-colors"
            >
              <Camera className="w-4 h-4 text-teal-600" />
              <span>Take Photo with Camera</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold shadow-xs transition-colors"
            >
              <Upload className="w-4 h-4 text-slate-500" />
              <span>Upload Picture from Computer</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            💡 <strong>Photography tip:</strong> Photograph the skin rash or lesion in clear, natural lighting. Keep the camera focused and avoid flash glare for optimal dermatological pattern recognition.
          </p>
        </div>
      )}

      {/* Camera Viewfinder Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-teal-600" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Live Camera Viewfinder
                </span>
              </div>
              <button
                type="button"
                onClick={handleCloseCameraModal}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Video Viewfinder Area */}
            <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Viewfinder Target Reticle */}
              <div className="absolute inset-8 border border-white/40 rounded-xl pointer-events-none flex items-center justify-center">
                <div className="w-4 h-4 border-t-2 border-l-2 border-teal-400 absolute top-0 left-0" />
                <div className="w-4 h-4 border-t-2 border-r-2 border-teal-400 absolute top-0 right-0" />
                <div className="w-4 h-4 border-b-2 border-l-2 border-teal-400 absolute bottom-0 left-0" />
                <div className="w-4 h-4 border-b-2 border-r-2 border-teal-400 absolute bottom-0 right-0" />
                <span className="text-[11px] text-white/70 bg-black/50 px-2 py-0.5 rounded backdrop-blur-xs">
                  Center skin lesion in frame
                </span>
              </div>

              {cameraError && (
                <div className="absolute inset-0 bg-slate-900/90 p-6 flex flex-col items-center justify-center text-center text-white space-y-3">
                  <AlertCircle className="w-8 h-8 text-amber-400" />
                  <p className="text-xs max-w-xs">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => mobileCameraInputRef.current?.click()}
                    className="px-4 py-2 bg-teal-600 rounded-lg text-xs font-bold"
                  >
                    Use Native Camera App
                  </button>
                </div>
              )}
            </div>

            {/* Modal Controls Bar */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleFlipCamera}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="Switch front/back camera"
              >
                <FlipHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">Flip Camera</span>
              </button>

              <button
                type="button"
                onClick={handleSnapPhoto}
                disabled={!streamActive}
                className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl shadow-md transition-all hover:scale-102"
              >
                <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                <span>Capture Photo</span>
              </button>

              <button
                type="button"
                onClick={handleCloseCameraModal}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
