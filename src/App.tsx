/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { Camera, UserPlus, ClipboardList, Settings, CheckCircle, XCircle, Trash2, ShieldCheck, RefreshCw, Bell, Calendar, LogIn, LogOut, Plus, Clock, BarChart3, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as faceapi from 'face-api.js';
import { loadModels, getFaceDescriptor, compareFaces, capturePhoto } from './lib/faceApi';
import { useAttendanceSystem, Student, AttendanceRecord, Schedule } from './lib/store';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail } from './firebase';

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<any, any> {
  public state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsedError = JSON.parse((this.state.error as any)?.message || "{}");
        if (parsedError.error) {
          errorMessage = `Firebase Error: ${parsedError.error} during ${parsedError.operationType} on ${parsedError.path}`;
        }
      } catch (e) {
        errorMessage = (this.state.error as any)?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-4 border border-rose-100">
            <XCircle className="w-16 h-16 text-rose-500 mx-auto" />
            <h2 className="text-2xl font-bold text-slate-800">Application Error</h2>
            <p className="text-slate-600 text-sm">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

type Tab = 'attendance' | 'register' | 'records' | 'admin' | 'notifications' | 'stats';

export default function App() {
  return (
    <ErrorBoundary>
      <AttendanceApp />
    </ErrorBoundary>
  );
}

function AttendanceApp() {
  const [showIntro, setShowIntro] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('attendance');
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('pandeyomg40@gmail.com');
  const [adminPassword, setAdminPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  
  // Attendance Mode Logic
  const [attendanceMode, setAttendanceMode] = useState<'Sign In' | 'Sign Out'>('Sign In');
  const [isManualMode, setIsManualMode] = useState(false);

  const { 
    students, 
    records, 
    schedules, 
    isAdminLoggedIn, 
    setIsAdminLoggedIn, 
    registerStudent, 
    markAttendance, 
    deleteStudent,
    addSchedule,
    deleteSchedule,
    getStats
  } = useAttendanceSystem();

  // Admin Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email === 'pandeyomg40@gmail.com') {
        setIsAdminLoggedIn(true);
      } else {
        setIsAdminLoggedIn(false);
      }
    });
    return () => unsubscribe();
  }, [setIsAdminLoggedIn]);

  const handleAdminLogin = async () => {
    try {
      if (!adminPassword) {
        setMessage({ text: "Please enter a password.", type: 'error' });
        return;
      }
      const result = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
      if (result.user.email !== 'pandeyomg40@gmail.com') {
        await signOut(auth);
        setMessage({ text: "Access Denied: Only authorized admin can login.", type: 'error' });
      } else {
        setMessage({ text: "Admin logged in successfully", type: 'success' });
        setShowAdminLogin(false);
        setAdminPassword('');
        setActiveTab('register');
      }
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setMessage({ text: "Invalid email or password.", type: 'error' });
      } else {
        setMessage({ text: "Login failed. Please try again.", type: 'error' });
      }
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user.email !== 'pandeyomg40@gmail.com') {
        await signOut(auth);
        setMessage({ text: "Access Denied: Only authorized admin can login.", type: 'error' });
      } else {
        setMessage({ text: "Admin logged in successfully", type: 'success' });
        setShowAdminLogin(false);
        setActiveTab('register');
      }
    } catch (error) {
      console.error("Google Login error:", error);
      setMessage({ text: "Google Login failed.", type: 'error' });
    }
  };

  const handleForgotPassword = async () => {
    if (!adminEmail) {
      setMessage({ text: "Please enter your email address first.", type: 'error' });
      return;
    }
    try {
      await sendPasswordResetEmail(auth, adminEmail);
      setMessage({ text: "Password reset email sent! Check your inbox.", type: 'success' });
      setIsResettingPassword(false);
    } catch (error: any) {
      console.error("Reset error:", error);
      setMessage({ text: "Failed to send reset email. " + error.message, type: 'error' });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsAdminLoggedIn(false);
      setActiveTab('attendance');
      setMessage({ text: "Logged out successfully", type: 'info' });
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // Registration form state
  const [regName, setRegName] = useState('');
  const [regRoll, setRegRoll] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  // Schedule form state
  const [schTitle, setSchTitle] = useState('');
  const [schDesc, setSchDesc] = useState('');
  const [schTime, setSchTime] = useState('');

  // Auto-switch attendance mode based on time
  useEffect(() => {
    if (isManualMode) return;

    const checkTime = () => {
      const now = new Date();
      const hour = now.getHours();
      
      if (hour >= 8 && hour < 14) {
        setAttendanceMode('Sign In');
      } else if (hour >= 14) {
        setAttendanceMode('Sign Out');
      }
    };

    checkTime();
    const interval = setInterval(checkTime, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [isManualMode]);

  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await loadModels();
        setIsModelsLoaded(true);
      } catch (err) {
        console.error("Failed to load models:", err);
        setMessage({ text: "Failed to load face recognition models.", type: 'error' });
      }
    };
    init();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      } else {
        // If ref is lost during stream acquisition, stop the tracks
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (err) {
      console.error("Camera access denied:", err);
      setMessage({ text: "Camera access denied. Please enable permissions.", type: 'error' });
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
    }
  };

  const videoRef = useRef<HTMLVideoElement>(null);

  const handleRegister = async () => {
    if (!regName || !regRoll || !videoRef.current) return;
    
    // Check if video is actually playing and has data
    if (videoRef.current.paused || videoRef.current.ended || videoRef.current.readyState < 2) {
      setMessage({ text: "Camera is not ready. Please wait a moment.", type: 'error' });
      return;
    }

    setIsCapturing(true);
    setScanProgress(0);
    
    // Start progress animation
    const scanInterval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) return 100;
        return prev + 2;
      });
    }, 40);

    try {
      console.log("Starting face capture with retry logic...");
      
      // Give the user a moment to stabilize
      await new Promise(resolve => setTimeout(resolve, 1000));

      let descriptor: Float32Array | undefined;
      const captureStartTime = Date.now();
      const MAX_CAPTURE_TIME = 15000; // 15 seconds total retry time

      // Retry loop: keep trying to get a descriptor for up to 15 seconds
      while (!descriptor && (Date.now() - captureStartTime < MAX_CAPTURE_TIME)) {
        if (!videoRef.current) break;
        
        console.log(`Attempting capture... (${Math.round((Date.now() - captureStartTime)/1000)}s)`);
        descriptor = await getFaceDescriptor(videoRef.current);
        
        if (!descriptor) {
          // Wait a bit before next attempt to not choke the CPU
          await new Promise(resolve => setTimeout(resolve, 500));
          // Update progress based on time elapsed if we haven't reached 90%
          setScanProgress(prev => Math.min(90, prev + 5));
        }
      }
      
      // Ensure the progress reaches 100% for smooth UX
      setScanProgress(100);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (descriptor) {
        console.log("Face descriptor captured successfully for:", regName);
        const photo = capturePhoto(videoRef.current);
        await registerStudent(regName, regRoll, descriptor, photo);
        setRegName('');
        setRegRoll('');
        setMessage({ text: "Student registered successfully!", type: 'success' });
        setActiveTab('records');
      } else {
        console.warn("No face detected after multiple attempts");
        setMessage({ text: "Could not capture a clear face. Please ensure you are in a well-lit area and looking directly at the camera.", type: 'error' });
      }
    } catch (err) {
      console.error("Registration error:", err);
      const errorMsg = err instanceof Error && err.message === "Timeout" 
        ? "Detection timed out. Please try again in better lighting." 
        : "Error capturing face data. Please try again.";
      setMessage({ text: errorMsg, type: 'error' });
    } finally {
      clearInterval(scanInterval);
      setIsCapturing(false);
      setScanProgress(0);
    }
  };

  const [isScanning, setIsScanning] = useState(false);
  const scanInterval = useRef<NodeJS.Timeout | null>(null);

  const handleAttendance = useCallback(async () => {
    if (!videoRef.current || students.length === 0 || isScanning) return;

    setIsScanning(true);
    const descriptor = await getFaceDescriptor(videoRef.current);
    
    if (!descriptor) {
      setMessage({ text: "Data not found. Please position your face.", type: 'info' });
      setIsScanning(false);
      return;
    }

    let matchedStudentId: string | null = null;
    for (const student of students) {
      const storedDescriptor = new Float32Array(student.faceDescriptor);
      if (compareFaces(descriptor, storedDescriptor)) {
        matchedStudentId = student.id;
        break;
      }
    }

    if (matchedStudentId) {
      const result = await markAttendance(matchedStudentId, attendanceMode);
      if (result.startsWith('Success')) {
        const student = students.find(s => s.id === matchedStudentId);
        setMessage({ text: `${attendanceMode} marked for ${student?.name}`, type: 'success' });
      } else {
        setMessage({ text: result, type: 'info' });
      }
    } else {
      setMessage({ text: "Data not found. Please sign in or register with Admin.", type: 'error' });
    }
    
    setTimeout(() => setIsScanning(false), 3000); // Cool down
  }, [students, markAttendance, isScanning, attendanceMode]);

  useEffect(() => {
    let detectionInterval: NodeJS.Timeout;

    if (activeTab === 'register' && isModelsLoaded && isCameraActive) {
      detectionInterval = setInterval(async () => {
        if (videoRef.current && !isCapturing) {
          const detection = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions());
          setIsFaceDetected(!!detection);
        }
      }, 500);
    }

    return () => {
      if (detectionInterval) clearInterval(detectionInterval);
    };
  }, [activeTab, isModelsLoaded, isCameraActive, isCapturing]);

  useEffect(() => {
    if ((activeTab === 'attendance' || activeTab === 'register') && isModelsLoaded) {
      startCamera();
      if (activeTab === 'attendance') {
        scanInterval.current = setInterval(() => {
          if (!isScanning) handleAttendance();
        }, 5000);
      }
    } else {
      stopCamera();
      if (scanInterval.current) clearInterval(scanInterval.current);
    }
    return () => {
      stopCamera();
      if (scanInterval.current) clearInterval(scanInterval.current);
    };
  }, [activeTab, isModelsLoaded, handleAttendance, isScanning]);

  const handleAddSchedule = async () => {
    if (!schTitle || !schDesc || !schTime) return;
    await addSchedule(schTitle, schDesc, schTime);
    setSchTitle('');
    setSchDesc('');
    setSchTime('');
    setMessage({ text: "Schedule updated successfully", type: 'success' });
  };

  if (showIntro) {
    return (
      <div className="min-h-screen bg-indigo-700 flex items-center justify-center overflow-hidden">
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="text-center"
        >
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="inline-block p-4 bg-white/20 rounded-full mb-6"
          >
            <ShieldCheck className="w-20 h-20 text-white" />
          </motion.div>
          <h1 className="text-4xl font-bold text-white tracking-widest">CSE ATTENDANCE</h1>
          <p className="text-indigo-200 mt-2 font-medium">SECURE BIOMETRIC SYSTEM</p>
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ delay: 1, duration: 1.5 }}
            className="h-1 bg-white/30 mt-8 rounded-full overflow-hidden"
          >
            <div className="h-full bg-white w-1/2 animate-shimmer" />
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-indigo-700 text-white p-6 shadow-lg sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">CSE Attendance</h1>
              <p className="text-indigo-100 text-sm">{isAdminLoggedIn ? 'Admin Mode' : 'Student Mode'}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {!isAdminLoggedIn ? (
              <button 
                onClick={() => setShowAdminLogin(true)}
                className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl flex items-center gap-2 transition-all font-semibold"
              >
                <LogIn className="w-4 h-4" />
                Admin Login
              </button>
            ) : (
              <button 
                onClick={handleLogout}
                className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 px-4 py-2 rounded-xl flex items-center gap-2 transition-all font-semibold"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {/* Alerts */}
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`mb-6 p-4 rounded-xl flex items-center gap-3 shadow-sm ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                message.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              <span className="font-medium">{message.text}</span>
              <button onClick={() => setMessage(null)} className="ml-auto hover:opacity-70">
                <XCircle className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Tabs */}
        <div className="flex bg-white p-1 rounded-2xl shadow-sm mb-8 border border-slate-200 overflow-x-auto no-scrollbar">
          {!isAdminLoggedIn ? (
            <>
              <TabButton active={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')} icon={<Camera />} label="Attendance" />
              <TabButton active={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} icon={<Bell />} label="Notifications" />
            </>
          ) : (
            <>
              <TabButton active={activeTab === 'register'} onClick={() => setActiveTab('register')} icon={<UserPlus />} label="Register" />
              <TabButton active={activeTab === 'records'} onClick={() => setActiveTab('records')} icon={<ClipboardList />} label="Records" />
              <TabButton active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} icon={<BarChart3 />} label="Analytics" />
              <TabButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} icon={<Calendar />} label="Schedule" />
            </>
          )}
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100 overflow-hidden min-h-[500px]">
          {activeTab === 'attendance' && (
            <div className="flex flex-col items-center gap-8">
              {/* Mode Toggle */}
              <div className="flex items-center gap-4 bg-slate-100 p-2 rounded-2xl">
                <button 
                  onClick={() => {
                    setAttendanceMode('Sign In');
                    setIsManualMode(true);
                  }}
                  className={`px-6 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${
                    attendanceMode === 'Sign In' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500'
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </button>
                <button 
                  onClick={() => {
                    setAttendanceMode('Sign Out');
                    setIsManualMode(true);
                  }}
                  className={`px-6 py-2 rounded-xl font-bold transition-all flex items-center gap-2 ${
                    attendanceMode === 'Sign Out' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-500'
                  }`}
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
                <button 
                  onClick={() => setIsManualMode(false)}
                  className={`p-2 rounded-xl transition-all ${!isManualMode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                  title="Auto Mode"
                >
                  <Clock className="w-5 h-5" />
                </button>
              </div>

              <div className="relative w-full max-w-md aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-2xl ring-4 ring-indigo-50">
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                <div className="absolute inset-0 border-2 border-indigo-400/30 pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-indigo-400 rounded-full opacity-50 border-dashed animate-pulse" />
                </div>
                {isScanning && (
                  <div className="absolute inset-0 bg-indigo-600/40 flex items-center justify-center backdrop-blur-[2px]">
                    <div className="text-white font-bold text-xl animate-pulse flex flex-col items-center gap-3">
                      <RefreshCw className="w-10 h-10 animate-spin" />
                      <span className="tracking-widest uppercase text-sm">Analyzing Face...</span>
                    </div>
                  </div>
                )}
                <AnimatePresence>
                  {message && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className={`absolute bottom-4 left-4 right-4 p-3 rounded-xl text-center font-bold text-sm shadow-lg ${
                        message.type === 'success' ? 'bg-emerald-500 text-white' :
                        message.type === 'error' ? 'bg-rose-500 text-white' :
                        'bg-indigo-500 text-white'
                      }`}
                    >
                      {message.text}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-slate-800">
                  {attendanceMode} Mode {!isManualMode && '(Auto)'}
                </h3>
                <p className="text-slate-500">Position your face in the frame to mark attendance</p>
              </div>
              <button
                onClick={handleAttendance}
                disabled={!isModelsLoaded || isScanning}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-10 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center gap-3"
              >
                <Camera className="w-6 h-6" />
                Manual Scan
              </button>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Bell className="w-6 h-6 text-indigo-600" />
                Daily Routine & Schedules
              </h2>
              <div className="grid gap-4">
                {schedules.map((sch) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={sch.id} 
                    className="p-6 bg-indigo-50 rounded-2xl border border-indigo-100 relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600" />
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-indigo-900 text-lg">{sch.title}</h3>
                      <span className="text-xs font-bold bg-indigo-200 text-indigo-700 px-2 py-1 rounded uppercase tracking-wider">
                        {sch.time}
                      </span>
                    </div>
                    <p className="text-indigo-700/80">{sch.description}</p>
                    <div className="mt-4 text-xs text-indigo-400 font-medium">
                      Posted on: {new Date(sch.date).toLocaleDateString()}
                    </div>
                  </motion.div>
                ))}
                {schedules.length === 0 && (
                  <div className="py-20 text-center text-slate-400 italic bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                    No notifications or schedules for today.
                  </div>
                )}
              </div>
            </div>
          )}

          {isAdminLoggedIn && activeTab === 'register' && (
            <div className="grid md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-indigo-100 p-2 rounded-lg">
                    <UserPlus className="w-6 h-6 text-indigo-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800">Register Student</h2>
                </div>
                
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Student Information</p>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="Full Name"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      />
                      <input
                        type="text"
                        value={regRoll}
                        onChange={(e) => setRegRoll(e.target.value)}
                        placeholder="Roll Number"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Instructions</p>
                    <ul className="text-sm text-indigo-700 space-y-1">
                      <li className="flex items-center gap-2">• Position face within the circular guide</li>
                      <li className="flex items-center gap-2">• Ensure good lighting on your face</li>
                      <li className="flex items-center gap-2">• Keep a neutral expression</li>
                    </ul>
                  </div>
                </div>

                <button
                  onClick={handleRegister}
                  disabled={!regName || !regRoll || isCapturing || !isModelsLoaded || !isFaceDetected}
                  className={`w-full py-4 rounded-2xl font-bold shadow-lg transition-all flex justify-center items-center gap-2 ${
                    !isFaceDetected && !isCapturing 
                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed' 
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
                  }`}
                >
                  {isCapturing ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Scanning Face {scanProgress}%</span>
                    </>
                  ) : !isModelsLoaded ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Loading AI Models...</span>
                    </>
                  ) : !isFaceDetected ? (
                    <>
                      <XCircle className="w-5 h-5" />
                      <span>Face Not Detected</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-5 h-5" />
                      <span>Capture & Register</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative aspect-square bg-slate-900 rounded-3xl overflow-hidden shadow-2xl ring-8 ring-slate-50 group">
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                
                {/* Face Guide Overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`w-64 h-64 border-4 rounded-full transition-all duration-500 ${
                    isFaceDetected ? 'border-emerald-400 scale-105 shadow-[0_0_30px_rgba(52,211,153,0.3)]' : 'border-white/20 border-dashed'
                  }`}>
                    {/* Scanning Line */}
                    {isCapturing && (
                      <motion.div 
                        initial={{ top: '0%' }}
                        animate={{ top: '100%' }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                        className="absolute left-0 right-0 h-1 bg-indigo-400 shadow-[0_0_15px_rgba(129,140,248,0.8)] z-10"
                      />
                    )}
                    
                    {/* Eye Scanning Indicators */}
                    {isCapturing && (
                      <>
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 0.5, repeat: Infinity }}
                          className="absolute top-1/3 left-1/4 w-4 h-4 border-2 border-indigo-400 rounded-full"
                        />
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 0.5, repeat: Infinity, delay: 0.2 }}
                          className="absolute top-1/3 right-1/4 w-4 h-4 border-2 border-indigo-400 rounded-full"
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Status Badges */}
                <div className="absolute top-4 left-4 flex flex-col gap-2">
                  <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 backdrop-blur-md ${
                    isFaceDetected ? 'bg-emerald-500/80 text-white' : 'bg-rose-500/80 text-white'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${isFaceDetected ? 'bg-white animate-pulse' : 'bg-white/50'}`} />
                    {isFaceDetected ? 'Face Detected' : 'No Face'}
                  </div>
                  {isCapturing && (
                    <div className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-indigo-500/80 text-white flex items-center gap-2 backdrop-blur-md">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Scanning Eyes...
                    </div>
                  )}
                </div>

                {/* Corner Accents */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white/30 m-6 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white/30 m-6 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white/30 m-6 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white/30 m-6 rounded-br-lg" />
              </div>
            </div>
          )}

          {isAdminLoggedIn && activeTab === 'records' && (
            <div className="space-y-10">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <ClipboardList className="w-6 h-6 text-indigo-600" />
                    Attendance Log
                  </h2>
                  <span className="bg-indigo-50 text-indigo-700 px-4 py-1 rounded-full text-sm font-bold">
                    Today: {records.filter(r => r.date === new Date().toISOString().split('T')[0]).length}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="py-4 font-semibold text-slate-500 text-sm">Student</th>
                        <th className="py-4 font-semibold text-slate-500 text-sm">Date</th>
                        <th className="py-4 font-semibold text-slate-500 text-sm">Sign In</th>
                        <th className="py-4 font-semibold text-slate-500 text-sm">Sign Out</th>
                        <th className="py-4 font-semibold text-slate-500 text-sm">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => {
                        const student = students.find(s => s.id === record.studentId);
                        return (
                          <tr key={record.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                            <td className="py-4">
                              <div className="flex items-center gap-3">
                                {student?.photo ? (
                                  <img 
                                    src={student.photo} 
                                    alt={record.studentName} 
                                    className="w-8 h-8 rounded-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                                    <UserPlus className="w-4 h-4" />
                                  </div>
                                )}
                                <span className="font-medium">{record.studentName}</span>
                              </div>
                            </td>
                            <td className="py-4 text-slate-600">{record.date}</td>
                          <td className="py-4 text-emerald-600 font-bold">{record.signInTime || '--:--'}</td>
                          <td className="py-4 text-rose-600 font-bold">{record.signOutTime || '--:--'}</td>
                          <td className="py-4">
                            <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">
                              {record.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {records.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-400 italic">
                            No attendance records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <hr className="border-slate-100" />

              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <UserPlus className="w-6 h-6 text-indigo-600" />
                    Student Database
                  </h2>
                  <span className="bg-slate-100 text-slate-600 px-4 py-1 rounded-full text-sm font-bold">
                    Total: {students.length}
                  </span>
                </div>
                <div className="grid gap-4">
                  {students.map((student) => (
                    <div key={student.id} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-4">
                        {student.photo ? (
                          <img 
                            src={student.photo} 
                            alt={student.name} 
                            className="w-12 h-12 rounded-full object-cover border-2 border-indigo-100"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                            <UserPlus className="w-6 h-6" />
                          </div>
                        )}
                        <div>
                          <h3 className="font-bold text-slate-800">{student.name}</h3>
                          <p className="text-sm text-slate-500">{student.rollNumber}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteStudent(student.id)}
                        className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                  {students.length === 0 && (
                    <div className="py-12 text-center text-slate-400 italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                      No students registered yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {isAdminLoggedIn && activeTab === 'stats' && (
            <div className="space-y-8">
              <h2 className="text-2xl font-bold text-slate-800">Attendance Analytics</h2>
              <div className="grid gap-6">
                {students.map((student) => {
                  const stats = getStats(student.id);
                  const todayRecord = records.find(r => r.studentId === student.id && r.date === new Date().toISOString().split('T')[0]);
                  
                  return (
                    <div key={student.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-4">
                          {student.photo ? (
                            <img 
                              src={student.photo} 
                              alt={student.name} 
                              className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-sm"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                              <UserPlus className="w-7 h-7" />
                            </div>
                          )}
                          <div>
                            <h3 className="text-lg font-bold text-slate-800">{student.name}</h3>
                            <p className="text-sm text-slate-500">{student.rollNumber}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-black text-indigo-600">{stats.percentage}%</span>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Overall Attendance</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Monthly Recap</p>
                          <p className="text-xl font-bold text-slate-800">{stats.monthlyRecap} Days</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Today Sign In</p>
                          <p className="text-xl font-bold text-emerald-600">{todayRecord?.signInTime || '--:--'}</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Today Sign Out</p>
                          <p className="text-xl font-bold text-rose-600">{todayRecord?.signOutTime || '--:--'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {students.length === 0 && (
                  <div className="py-20 text-center text-slate-400 italic">
                    No student data available for analytics.
                  </div>
                )}
              </div>
            </div>
          )}

          {isAdminLoggedIn && activeTab === 'admin' && (
            <div className="space-y-8">
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-slate-800">Update Routine</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <input
                      type="text"
                      value={schTitle}
                      onChange={(e) => setSchTitle(e.target.value)}
                      placeholder="Class Title (e.g. Data Structures)"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <textarea
                      value={schDesc}
                      onChange={(e) => setSchDesc(e.target.value)}
                      placeholder="Description or Room No."
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none h-24"
                    />
                    <input
                      type="text"
                      value={schTime}
                      onChange={(e) => setSchTime(e.target.value)}
                      placeholder="Time (e.g. 10:00 AM)"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button
                      onClick={handleAddSchedule}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl font-bold shadow-lg flex justify-center items-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      Post Notification
                    </button>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-bold text-slate-600 uppercase text-xs tracking-widest">Current Schedules</h3>
                    {schedules.map(sch => (
                      <div key={sch.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-slate-800">{sch.title}</p>
                          <p className="text-xs text-slate-500">{sch.time}</p>
                        </div>
                        <button onClick={() => deleteSchedule(sch.id)} className="text-rose-400 hover:text-rose-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {schedules.length === 0 && (
                      <div className="py-10 text-center text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        No schedules posted.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Admin Login Modal */}
      <AnimatePresence>
        {showAdminLogin && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-800">
                  {isResettingPassword ? 'Reset Password' : 'Admin Login'}
                </h2>
                <button onClick={() => {
                  setShowAdminLogin(false);
                  setIsResettingPassword(false);
                }} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              {isResettingPassword ? (
                <div className="space-y-4">
                  <p className="text-slate-500 text-sm">Enter your email to receive a password reset link.</p>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="Admin Email"
                    className="w-full px-4 py-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <button
                    onClick={handleForgotPassword}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl font-bold shadow-lg flex justify-center items-center gap-2 transition-all"
                  >
                    Send Reset Email
                  </button>
                  <button 
                    onClick={() => setIsResettingPassword(false)}
                    className="w-full text-indigo-600 font-bold text-sm hover:underline"
                  >
                    Back to Login
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-slate-500 text-sm">Enter your credentials to access administrative features.</p>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="Admin Email"
                    className="w-full px-4 py-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full px-4 py-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                  />
                  <div className="text-right">
                    <button 
                      onClick={() => setIsResettingPassword(true)}
                      className="text-indigo-600 text-xs font-bold hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <button
                    onClick={handleAdminLogin}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl font-bold shadow-lg flex justify-center items-center gap-3 transition-all active:scale-95"
                  >
                    <LogIn className="w-5 h-5" />
                    Sign In
                  </button>
                  
                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-100"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-slate-400 font-bold">Or</span>
                    </div>
                  </div>

                  <button
                    onClick={handleGoogleLogin}
                    className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 py-3 rounded-xl font-bold shadow-sm flex justify-center items-center gap-3 transition-all"
                  >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                    Continue with Google
                  </button>

                  <p className="text-center text-[10px] text-slate-400 uppercase tracking-widest font-bold">Authorized Personnel Only</p>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="max-w-4xl mx-auto p-8 text-center text-slate-400 text-sm">
        CSE Biometric System &copy; 2026
      </footer>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold transition-all ${
        active ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
      }`}
    >
      {React.cloneElement(icon as React.ReactElement, { className: 'w-5 h-5' })}
      <span>{label}</span>
    </button>
  );
}
