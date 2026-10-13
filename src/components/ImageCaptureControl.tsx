import React, { useState, useRef, useEffect } from 'react';
import { Sheet } from './Sheet';
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
  const [consentOpen, setConsentOpen] = useState(false);
  const [consent, setConsent] = useState<boolean>(() => {
    try {
      return localStorage.getItem('medi_rag_photo_consent') === 'yes';
    } catch {
      return false;
    }
  });
  const pendingAction = useRef<(() => void) | null>(null);

  /** Photos are sent to Gemini, so ask once for explicit consent before the first attach. */
  const requireConsent = (action: () => void) => {
    if (consent) {
      action();
      return;
    }
    pendingAction.current = action;
    setConsentOpen(true);
  };
  const acceptConsent = () => {
    try {
      localStorage.setItem('medi_rag_photo_consent', 'yes');
    } catch {
      // ignore storage errors
    }
    setConsent(true);
    setConsentOpen(false);
    pendingAction.current?.();
    pendingAction.current = null;
  };

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

      {image ? (
        <div className="card-flat flex items-center gap-3 p-2.5">
          <div className="relative w-14 h-14 rounded-xl overflow-hidden border-[1.5px] border-slate-900 dark:border-slate-600 bg-black shrink-0">
            <img src={image.previewUrl} alt="Attached skin photo" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{image.fileName}</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Experimental, not diagnostic. Sent to Gemini with this question only.
            </p>
          </div>
          <button type="button" onClick={() => onImageChange(null)} className="btn btn-ghost btn-sm shrink-0" aria-label="Remove photo">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : compact ? (
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => requireConsent(() => fileInputRef.current?.click())} className="btn btn-ghost btn-sm" aria-label="Upload a skin photo (experimental)">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Photo</span>
          </button>
          <button type="button" onClick={() => requireConsent(handleOpenCameraModal)} className="btn btn-ghost btn-sm" aria-label="Take a skin photo with the camera (experimental)">
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">Camera</span>
          </button>
        </div>
      ) : (
        <div className="card-flat p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold flex items-center gap-2"><Camera className="w-4 h-4 text-teal-600" />{label} (experimental)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="button" onClick={() => requireConsent(handleOpenCameraModal)} className="btn"><Camera className="w-4 h-4" /><span>Take photo</span></button>
            <button type="button" onClick={() => requireConsent(() => fileInputRef.current?.click())} className="btn"><Upload className="w-4 h-4" /><span>Upload picture</span></button>
          </div>
        </div>
      )}

      {/* One-time consent */}
      <Sheet
        open={consentOpen}
        onClose={() => setConsentOpen(false)}
        title="Before you add a photo"
        footer={
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn btn-ghost" onClick={() => setConsentOpen(false)}>Not now</button>
            <button type="button" className="btn btn-primary" onClick={acceptConsent}>I understand, continue</button>
          </div>
        }
      >
        <ul className="list-disc pl-5 space-y-2 text-base md:text-sm leading-relaxed">
          <li><b>Experimental and not diagnostic.</b> A photo cannot replace an examination by a doctor or dermatologist.</li>
          <li>The photo is <b>sent to Google Gemini</b> to answer this question. It is not saved by this app.</li>
          <li>Please do not include faces, names or other identifying details.</li>
          <li>Spreading redness with fever, widespread blistering or mouth sores need urgent in-person care.</li>
        </ul>
      </Sheet>

      {/* Camera viewfinder */}
      <Sheet
        open={showCameraModal}
        onClose={handleCloseCameraModal}
        title="Camera"
        footer={
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={handleFlipCamera} className="btn btn-ghost btn-sm" aria-label="Switch front and back camera">
              <FlipHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Flip</span>
            </button>
            <button type="button" onClick={handleSnapPhoto} disabled={!streamActive} className="btn btn-primary">
              <span className="w-3 h-3 rounded-full bg-slate-900" />
              <span>Capture</span>
            </button>
            <button type="button" onClick={handleCloseCameraModal} className="btn btn-ghost btn-sm">Cancel</button>
          </div>
        }
      >
        <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden rounded-2xl">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          {cameraError && (
            <div className="absolute inset-0 bg-slate-900/90 p-6 flex flex-col items-center justify-center text-center text-white space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-400" />
              <p className="text-sm max-w-xs">{cameraError}</p>
              <button type="button" onClick={() => mobileCameraInputRef.current?.click()} className="btn btn-primary">
                Use the phone camera app
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">Natural light, no flash, lesion centred and in focus. Experimental, not diagnostic.</p>
      </Sheet>
    </div>
  );
};
