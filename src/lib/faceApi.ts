import * as faceapi from 'face-api.js';

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

export async function loadModels() {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
  ]);
}

export async function getFaceDescriptor(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) {
  try {
    console.log("Detecting face for descriptor...");
    // Use TinyFaceDetector with optimized settings for browser environments
    const detection = await faceapi
      .detectSingleFace(imageElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    
    if (!detection) {
      console.warn("Face detection failed during descriptor extraction");
      return undefined;
    }
    
    console.log("Face descriptor extracted successfully");
    return detection.descriptor;
  } catch (error) {
    console.error("Error in getFaceDescriptor:", error);
    return undefined;
  }
}

export function capturePhoto(videoElement: HTMLVideoElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Mirror the photo to match the preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  }
  return '';
}

export function compareFaces(descriptor1: Float32Array, descriptor2: Float32Array) {
  const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
  return distance < 0.6; // Threshold for matching
}
