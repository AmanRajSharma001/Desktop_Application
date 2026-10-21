import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import MainExam from "./components/MainExam";

function App() {
  const videoRef = useRef(null);
  const videoStreamRef = useRef(null);
  const imageCaptureRef = useRef(null);
  const isCapturingRef = useRef(false);

  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [examEnded, setExamEnded] = useState(false);
  const [examEndMessage, setExamEndMessage] = useState("");

  // Prerequisites status
  const [cameraStatus, setCameraStatus] = useState("Not Ready"); // "Not Ready" | "Ready" | "Error"
  const [cameraError, setCameraError] = useState("");

  const [fullscreenStatus, setFullscreenStatus] = useState("Inactive"); // "Inactive" | "Active" | "Error"
  const [fullscreenError, setFullscreenError] = useState("");

  const [startError, setStartError] = useState("");
  const [recoveryError, setRecoveryError] = useState("");

  const cleanupCamera = useCallback(() => {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn("Error stopping track:", e);
        }
      });
      videoStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    imageCaptureRef.current = null;
    setCameraStatus("Not Ready");
  }, []);

  // End exam and teardown all hardware/timers
  const handleEndExam = useCallback(
    async (message = "Exam ended.") => {
      cleanupCamera();

      if (window.electronAPI && window.electronAPI.endTest) {
        try {
          await window.electronAPI.endTest();
        } catch (err) {
          console.warn("Error calling endTest IPC:", err);
        }
      }

      setStarted(false);
      setExamEnded(true);
      setExamEndMessage(message);
      setTime(0);
    },
    [cleanupCamera]
  );

  // Check initial native fullscreen state and register listener
  useEffect(() => {
    let isMounted = true;

    if (window.electronAPI && window.electronAPI.getFullscreenStatus) {
      window.electronAPI
        .getFullscreenStatus()
        .then((state) => {
          if (isMounted && state) {
            setFullscreenStatus(state.isActive ? "Active" : "Inactive");
          }
        })
        .catch((err) => {
          console.warn("Could not query native fullscreen status:", err);
          if (isMounted) setFullscreenStatus("Inactive");
        });
    }

    let unsubscribe = () => {};
    if (window.electronAPI && window.electronAPI.onFullscreenChange) {
      unsubscribe = window.electronAPI.onFullscreenChange((data) => {
        if (!isMounted) return;
        if (data.isActive) {
          setFullscreenStatus("Active");
          setFullscreenError("");
          setRecoveryError("");
        } else {
          setFullscreenStatus("Inactive");
        }
      });
    }

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Timer countdown synchronization with Electron main process
  useEffect(() => {
    if (!started) return;

    let isMounted = true;

    async function syncRemainingTime() {
      if (window.electronAPI && window.electronAPI.getRemainingTime) {
        try {
          const remaining = await window.electronAPI.getRemainingTime();
          if (isMounted) {
            setTime(remaining);
            if (remaining <= 0) {
              handleEndExam("Exam time has expired. Your assessment has concluded.");
            }
          }
        } catch (err) {
          console.warn("Time sync error:", err);
        }
      }
    }

    syncRemainingTime();
    const interval = setInterval(syncRemainingTime, 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [started, handleEndExam]);

  // Camera acquisition with track validation
  async function getCamera() {
    setCameraError("");
    setStartError("");

    // Prevent duplicate camera streams: cleanup prior tracks
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("getUserMedia is not supported on this platform.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      const tracks = stream.getVideoTracks();
      if (!tracks || tracks.length === 0) {
        throw new Error("No video tracks found on camera stream.");
      }

      const track = tracks[0];
      if (track.readyState !== "live") {
        throw new Error(`Video track is not live (${track.readyState}).`);
      }

      videoStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      if (typeof ImageCapture !== "undefined") {
        try {
          imageCaptureRef.current = new ImageCapture(track);
        } catch (e) {
          console.warn("ImageCapture constructor warning:", e);
        }
      }

      setCameraStatus("Ready");
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraStatus("Error");
      let msg = err.message || "Failed to access camera.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        msg = "Camera permission was denied. Please allow camera permissions in system settings.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        msg = "No camera device found. Please connect an active webcam.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        msg = "Camera is already in use by another application.";
      }
      setCameraError(msg);
    }
  }

  // Native fullscreen activation and verification
  async function getFullscreen() {
    setFullscreenError("");
    setStartError("");

    try {
      if (window.electronAPI && window.electronAPI.setFullScreen) {
        const res = await window.electronAPI.setFullScreen();
        if (res && res.success === false) {
          setFullscreenStatus("Error");
          setFullscreenError(res.error || "Failed to activate fullscreen/kiosk.");
          return;
        }

        const state = await window.electronAPI.getFullscreenStatus();
        if (state && state.isActive) {
          setFullscreenStatus("Active");
        } else {
          setFullscreenStatus("Inactive");
          setFullscreenError("Native fullscreen could not be verified.");
        }
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setFullscreenStatus("Active");
      }
    } catch (err) {
      console.error("Fullscreen activation error:", err);
      setFullscreenStatus("Error");
      setFullscreenError(err.message || "Fullscreen activation failed.");
    }
  }

  // Camera snapshot proctoring: fires every 5s during active verified exam
  async function clickPhoto() {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;

    try {
      const track = videoStreamRef.current?.getVideoTracks()[0];
      if (!track || track.readyState !== "live") {
        return;
      }

      let buffer = null;

      if (imageCaptureRef.current && typeof imageCaptureRef.current.takePhoto === "function") {
        try {
          const blob = await imageCaptureRef.current.takePhoto();
          buffer = await blob.arrayBuffer();
        } catch (e) {
          console.warn("takePhoto fallback to canvas capture:", e);
        }
      }

      if (!buffer && videoRef.current && videoRef.current.videoWidth > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.8)
        );
        if (blob) {
          buffer = await blob.arrayBuffer();
        }
      }

      if (buffer && window.electronAPI && window.electronAPI.savePhoto) {
        await window.electronAPI.savePhoto(buffer);
      }
    } catch (err) {
      console.warn("Snapshot capture error:", err);
    } finally {
      isCapturingRef.current = false;
    }
  }

  useEffect(() => {
    // Captures only occur during started exam when fullscreen is active
    if (!started || fullscreenStatus !== "Active") return;

    const id = setInterval(() => {
      clickPhoto();
    }, 5000);

    return () => {
      clearInterval(id);
    };
  }, [started, fullscreenStatus]);

  // Start exam with strict revalidation of both prerequisites
  async function startTest() {
    if (isStarting) return;
    setIsStarting(true);
    setStartError("");

    try {
      // 1. Revalidate Camera
      const videoTrack = videoStreamRef.current?.getVideoTracks()[0];
      const isCameraActive = Boolean(
        videoStreamRef.current &&
          videoTrack &&
          videoTrack.readyState === "live" &&
          videoTrack.enabled
      );

      if (!isCameraActive) {
        setCameraStatus("Error");
        setCameraError(
          "Camera is not active. Please re-enable camera access before starting."
        );
        setStartError(
          "Cannot start exam: Camera stream or track is inactive. Please click 'Enable Camera' and ensure your camera is working."
        );
        setIsStarting(false);
        return;
      }

      // 2. Revalidate Native Fullscreen
      let isNativeFullscreen = false;
      if (window.electronAPI && window.electronAPI.getFullscreenStatus) {
        const state = await window.electronAPI.getFullscreenStatus();
        isNativeFullscreen = Boolean(state && state.isActive);
      } else if (typeof document !== "undefined") {
        isNativeFullscreen = Boolean(document.fullscreenElement);
      }

      if (!isNativeFullscreen) {
        setFullscreenStatus("Inactive");
        setStartError(
          "Cannot start exam: Fullscreen is not active. Please click 'Enter Fullscreen' before starting."
        );
        setIsStarting(false);
        return;
      }

      // Show rules modal dialog
      if (window.electronAPI && window.electronAPI.showExamRules) {
        const res = await window.electronAPI.showExamRules();
        if (res !== 1) {
          // User clicked Cancel or dismissed
          setIsStarting(false);
          return;
        }
      }

      // Start authoritative countdown timer in main process
      if (window.electronAPI && window.electronAPI.startTest) {
        await window.electronAPI.startTest();
      }

      setStarted(true);
      setExamEnded(false);
    } catch (err) {
      console.error("Start exam error:", err);
      setStartError(`Failed to start exam: ${err.message}`);
    } finally {
      setIsStarting(false);
    }
  }

  // Recovery action when fullscreen is exited during active exam
  async function handleRecoverFullscreen() {
    setRecoveryError("");
    try {
      if (window.electronAPI && window.electronAPI.setFullScreen) {
        await window.electronAPI.setFullScreen();
        const verified = await window.electronAPI.getFullscreenStatus();
        if (verified && verified.isActive) {
          setFullscreenStatus("Active");
          setRecoveryError("");
        } else {
          setRecoveryError(
            "Fullscreen could not be restored. Please ensure the app has window focus and try again."
          );
        }
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setFullscreenStatus("Active");
      }
    } catch (err) {
      setRecoveryError(err.message || "Failed to restore fullscreen.");
    }
  }

  function formatTimeLeft(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    const minutes = Math.floor((totalSeconds / 60) % 60)
      .toString()
      .padStart(2, "0");
    const hours = Math.floor(totalSeconds / 3600)
      .toString()
      .padStart(2, "0");

    return `${hours}:${minutes}:${seconds}`;
  }

  const isExamBlocked = started && fullscreenStatus !== "Active";
  const canStartExam = cameraStatus === "Ready" && fullscreenStatus === "Active" && !isStarting;

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={cameraStatus === "Ready" && !started ? "video-preview" : "hidden-video"}
      />

      {/* Fullscreen Recovery Overlay during active exam */}
      {isExamBlocked && (
        <div className="recovery-overlay">
          <div className="recovery-card">
            <div className="recovery-icon">⛶</div>
            <h2>Fullscreen Mode Exited</h2>
            <p>
              Fullscreen is mandatory during the exam. Question navigation and answer selection are blocked until fullscreen is restored.
            </p>
            {recoveryError && (
              <div className="validation-error-box" style={{ marginBottom: "16px" }}>
                {recoveryError}
              </div>
            )}
            <button onClick={handleRecoverFullscreen} className="btn btn-light-blue">
              Re-enter Fullscreen
            </button>
          </div>
        </div>
      )}

      {started ? (
        <MainExam
          time={formatTimeLeft(time)}
          onEndTest={() => handleEndExam("You have submitted and concluded the exam.")}
          isBlocked={isExamBlocked}
        />
      ) : (
        <div className="page-container">
          <div className="header-section">
            <h1>Hi User!</h1>
            <p>Kindly Allow the following Permissions to Start the test:</p>
          </div>

          <div className="mandatory-banner">
            <span className="banner-icon">⚠️</span>
            <span>
              <strong>Before starting the exam, you must enable your camera and enter fullscreen. Both are mandatory.</strong>
            </span>
          </div>

          <div className="card-container">
            {/* Camera Permission Item */}
            <div className="permission-item">
              <div className="permission-icon">↗</div>
              <div className="permission-content">
                <h3>Configure Camera</h3>
                <p>Kindly configure Camera to attempt quiz/contests.</p>
                <div className="action-row">
                  <button onClick={getCamera} className="btn btn-dark">
                    Enable Camera
                  </button>
                </div>

                <div
                  className={`status-badge ${
                    cameraStatus === "Ready"
                      ? "status-ready"
                      : cameraStatus === "Error"
                      ? "status-error"
                      : "status-not-ready"
                  }`}
                >
                  Camera Status: {cameraStatus}
                </div>

                {cameraError && (
                  <div className="validation-error-box">{cameraError}</div>
                )}

                {cameraStatus === "Ready" && <div className="camera-space" />}
              </div>
            </div>

            <div className="divider" />

            {/* Fullscreen Permission Item */}
            <div className="permission-item">
              <div className="permission-icon">⛶</div>
              <div className="permission-content">
                <h3>Switch to full screen</h3>
                <p>Kindly close all tabs and switch to full screen.</p>
                <div className="action-row">
                  <button onClick={getFullscreen} className="btn btn-light-blue">
                    Enter Fullscreen
                  </button>
                </div>

                <div
                  className={`status-badge ${
                    fullscreenStatus === "Active"
                      ? "status-ready"
                      : fullscreenStatus === "Error"
                      ? "status-error"
                      : "status-not-ready"
                  }`}
                >
                  Fullscreen Status: {fullscreenStatus}
                </div>

                {fullscreenError && (
                  <div className="validation-error-box">{fullscreenError}</div>
                )}
              </div>
            </div>
          </div>

          {startError && (
            <div className="validation-error-box" style={{ maxWidth: "920px", width: "100%", marginTop: "16px" }}>
              {startError}
            </div>
          )}

          {examEnded && (
            <div className="exam-ended-box">
              <h3>Exam Completed</h3>
              <p>{examEndMessage}</p>
            </div>
          )}

          <div className="bottom-actions">
            <button
              onClick={startTest}
              disabled={!canStartExam}
              className="btn btn-light-blue"
            >
              Start Exam
            </button>
            <button className="btn btn-outline">Need Help?</button>
          </div>

          <p style={{ marginTop: "16px", color: "#666" }}>
            Time Left : {formatTimeLeft(time)}
          </p>
        </div>
      )}
    </>
  );
}

export default App;
