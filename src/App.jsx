import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import MainExam from "./components/MainExam";

function App() {
  const videoRef = useRef(null);
  const videoStreamRef = useRef(null);
  const imageCaptureRef = useRef(null);
  const isCapturingRef = useRef(false);

  const screenVideoRef = useRef(null);
  const screenStreamRef = useRef(null);
  const isScreenCapturingRef = useRef(false);

  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [examEnded, setExamEnded] = useState(false);
  const [examEndMessage, setExamEndMessage] = useState("");
  const [isTimeExpired, setIsTimeExpired] = useState(false);

  // Prerequisites status
  const [cameraStatus, setCameraStatus] = useState("Not Ready"); // "Not Ready" | "Ready" | "Error"
  const [cameraError, setCameraError] = useState("");

  const [fullscreenStatus, setFullscreenStatus] = useState("Inactive"); // "Inactive" | "Active" | "Error"
  const [fullscreenError, setFullscreenError] = useState("");

  const [screenShareStatus, setScreenShareStatus] = useState("Not Ready"); // "Not Ready" | "Ready" | "Error"
  const [screenShareError, setScreenShareError] = useState("");
  const [selectedSourceName, setSelectedSourceName] = useState("");
  const [availableSources, setAvailableSources] = useState([]);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);

  const [startError, setStartError] = useState("");
  const [recoveryError, setRecoveryError] = useState("");

  const cleanupCamera = useCallback(() => {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn("Error stopping camera track:", e);
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

  const cleanupScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn("Error stopping screen track:", e);
        }
      });
      screenStreamRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
    setSelectedSourceName("");
    setScreenShareStatus("Not Ready");
  }, []);

  const handleScreenShareEnded = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn("Error stopping screen track:", e);
        }
      });
      screenStreamRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
    setSelectedSourceName("");
    setScreenShareStatus("Not Ready");
    setScreenShareError("Screen sharing has stopped. Please share your screen again.");
  }, []);

  // End exam and teardown all hardware/timers
  const handleEndExam = useCallback(
    async (message = "Exam ended.") => {
      cleanupCamera();
      cleanupScreenShare();

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
      setIsTimeExpired(false);
      setTime(0);
    },
    [cleanupCamera, cleanupScreenShare]
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
              setIsTimeExpired(true);
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

  // Open desktopCapturer source selection modal
  async function handleOpenScreenPicker() {
    setScreenShareError("");
    setStartError("");
    setSourceLoading(true);
    setShowSourcePicker(true);

    try {
      if (window.electronAPI && window.electronAPI.screenShare) {
        const res = await window.electronAPI.screenShare();
        if (!res || !res.success) {
          const errorMsg =
            res?.error ||
            "Screen sharing is required to take this exam. Please select a screen or window to share.";
          setScreenShareStatus("Error");
          setScreenShareError(errorMsg);
          setSourceLoading(false);
          return;
        }
        setAvailableSources(res.sources || []);
      } else if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        setShowSourcePicker(false);
        await acquireScreenStream({ id: "default", name: "Entire Screen" });
        return;
      } else {
        throw new Error("Screen sharing is not supported in this environment.");
      }
    } catch (err) {
      console.error("Error retrieving screen sources:", err);
      setScreenShareStatus("Error");
      setScreenShareError(err.message || "Failed to retrieve desktop sources.");
    } finally {
      setSourceLoading(false);
    }
  }

  // Select desktopCapturer source and obtain media stream
  async function acquireScreenStream(source) {
    setScreenShareError("");
    setStartError("");

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn("Error stopping screen track:", e);
        }
      });
      screenStreamRef.current = null;
    }

    try {
      let stream = null;

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && source.id !== "default") {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: source.id,
                maxWidth: window.screen?.width || 1920,
                maxHeight: window.screen?.height || 1080,
              },
            },
          });
        } catch (mediaErr) {
          console.warn("getUserMedia with desktop constraints failed, trying simplified constraints:", mediaErr);
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                mandatory: {
                  chromeMediaSource: "desktop",
                  chromeMediaSourceId: source.id,
                },
              },
            });
          } catch (innerErr) {
            if (navigator.mediaDevices.getDisplayMedia) {
              stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            } else {
              throw innerErr;
            }
          }
        }
      } else if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      } else {
        throw new Error("Screen sharing is not supported on this platform.");
      }

      if (!stream) {
        throw new Error("Failed to obtain screen sharing stream.");
      }

      const tracks = stream.getVideoTracks();
      if (!tracks || tracks.length === 0) {
        throw new Error("No video tracks found in screen sharing stream.");
      }

      const track = tracks[0];
      if (track.readyState !== "live") {
        throw new Error(`Screen video track is not live (${track.readyState}).`);
      }

      // Bind track ended listener
      track.onended = () => {
        handleScreenShareEnded();
      };

      screenStreamRef.current = stream;
      setSelectedSourceName(source.name || "Screen");

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
        try {
          await screenVideoRef.current.play();
        } catch (playErr) {
          console.warn("Screen video play error:", playErr);
        }
      }

      setScreenShareStatus("Ready");
      setScreenShareError("");
    } catch (err) {
      console.error("Screen stream acquisition error:", err);
      setScreenShareStatus("Error");
      let msg = err.message || "Failed to start screen sharing.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        msg = "Screen sharing permission was denied. Please select a screen or window to share.";
      }
      setScreenShareError(msg);
    }
  }

  async function handleSelectSource(source) {
    setShowSourcePicker(false);
    await acquireScreenStream(source);
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

  // Screen snapshot proctoring: fires every 5s during active verified exam
  async function captureScreenFrame() {
    if (isScreenCapturingRef.current) return;
    isScreenCapturingRef.current = true;

    try {
      const track = screenStreamRef.current?.getVideoTracks()[0];
      if (!track || track.readyState !== "live" || !track.enabled) {
        return;
      }

      const video = screenVideoRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85)
      );

      if (blob && window.electronAPI && window.electronAPI.saveScreenPhoto) {
        const buffer = await blob.arrayBuffer();
        await window.electronAPI.saveScreenPhoto(buffer);
      }
    } catch (err) {
      console.warn("Screen snapshot capture error:", err);
    } finally {
      isScreenCapturingRef.current = false;
    }
  }

  // Camera proctoring capture interval
  useEffect(() => {
    if (!started || fullscreenStatus !== "Active" || screenShareStatus !== "Ready") return;

    const id = setInterval(() => {
      clickPhoto();
    }, 5000);

    return () => {
      clearInterval(id);
    };
  }, [started, fullscreenStatus, screenShareStatus]);

  // Screen sharing proctoring capture interval
  useEffect(() => {
    if (!started || fullscreenStatus !== "Active" || screenShareStatus !== "Ready") return;

    const id = setInterval(() => {
      captureScreenFrame();
    }, 5000);

    return () => {
      clearInterval(id);
    };
  }, [started, fullscreenStatus, screenShareStatus]);

  // Start exam with strict revalidation of all three prerequisites
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
          "Camera access is required to take this exam."
        );
        setStartError(
          "Cannot start exam: Camera access is required to take this exam. Please click 'Enable Camera' and ensure your camera is working."
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
          "Cannot start exam: Fullscreen mode is required to take this exam. Please click 'Enter Fullscreen' before starting."
        );
        setIsStarting(false);
        return;
      }

      // 3. Revalidate Screen Sharing
      const screenTrack = screenStreamRef.current?.getVideoTracks()[0];
      const isScreenShareActive = Boolean(
        screenStreamRef.current &&
          screenTrack &&
          screenTrack.readyState === "live" &&
          screenTrack.enabled
      );

      if (!isScreenShareActive) {
        setScreenShareStatus("Not Ready");
        setScreenShareError(
          "Screen sharing is required to take this exam. Please select a screen or window to share."
        );
        setStartError(
          "Cannot start exam: Screen sharing is required to take this exam. Please click 'Enable Screen Sharing' and select a screen or window."
        );
        setIsStarting(false);
        return;
      }

      // Show rules modal dialog
      if (window.electronAPI && window.electronAPI.showExamRules) {
        const res = await window.electronAPI.showExamRules();
        if (res !== 1) {
          setIsStarting(false);
          return;
        }
      }

      // Start authoritative countdown timer in main process
      if (window.electronAPI && window.electronAPI.startTest) {
        const endTime = await window.electronAPI.startTest();
        if (endTime) {
          setTime(Math.max(0, endTime - Date.now()));
        }
      }

      setIsTimeExpired(false);
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

  const isFullscreenBlocked = started && fullscreenStatus !== "Active";
  const isScreenShareBlocked = started && screenShareStatus !== "Ready";
  const isExamBlocked = isFullscreenBlocked || isScreenShareBlocked;
  const canStartExam =
    cameraStatus === "Ready" &&
    fullscreenStatus === "Active" &&
    screenShareStatus === "Ready" &&
    !isStarting;

  return (
    <>
      {/* Floating camera preview (active on setup, hidden during exam) */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={cameraStatus === "Ready" && !started ? "video-preview" : "hidden-video"}
      />

      {/* Screen video capture element (always mounted to maintain stream decoding) */}
      <video
        ref={screenVideoRef}
        autoPlay
        muted
        playsInline
        className="hidden-video"
      />

      {/* Interruption Recovery Overlay during active exam */}
      {isExamBlocked && (
        <div className="recovery-overlay">
          {isFullscreenBlocked ? (
            <div className="recovery-card">
              <div className="recovery-icon">⛶</div>
              <h2>Fullscreen Mode Exited</h2>
              <p>
                Fullscreen mode is required to take this exam. Question navigation and answer selection are blocked until fullscreen is restored.
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
          ) : isScreenShareBlocked ? (
            <div className="recovery-card">
              <div className="recovery-icon">🖥️</div>
              <h2>Screen Sharing Stopped</h2>
              <p>
                Screen sharing has stopped. Please share your screen again. Question navigation and answer selection are blocked until screen sharing is active.
              </p>
              {screenShareError && (
                <div className="validation-error-box" style={{ marginBottom: "16px" }}>
                  {screenShareError}
                </div>
              )}
              <button onClick={handleOpenScreenPicker} className="btn btn-dark">
                Resume Screen Sharing
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Desktop Capturer Source Selection Modal */}
      {showSourcePicker && (
        <div className="source-picker-overlay">
          <div className="source-picker-card">
            <div className="source-picker-header">
              <h2>Select Screen or Window to Share</h2>
              <p>Screen sharing is required to take this exam. Please select a screen or window to share.</p>
            </div>

            {sourceLoading ? (
              <div className="source-loading-state">
                <p>Retrieving available desktop capture sources...</p>
              </div>
            ) : availableSources.length === 0 ? (
              <div className="source-empty-state">
                <p>No screens or windows found to share.</p>
              </div>
            ) : (
              <div className="source-grid">
                {availableSources.map((source) => (
                  <div
                    key={source.id}
                    className="source-item"
                    onClick={() => handleSelectSource(source)}
                  >
                    <div className="source-thumb-container">
                      {source.thumbnail ? (
                        <img
                          src={source.thumbnail}
                          alt={source.name}
                          className="source-thumb-img"
                        />
                      ) : (
                        <div className="source-thumb-placeholder">🖥️</div>
                      )}
                    </div>
                    <div className="source-info">
                      <span className="source-name" title={source.name}>
                        {source.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="source-picker-actions">
              <button
                onClick={() => {
                  setShowSourcePicker(false);
                  if (screenShareStatus !== "Ready") {
                    setScreenShareStatus("Not Ready");
                  }
                }}
                className="btn btn-outline"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {started ? (
        <MainExam
          time={formatTimeLeft(time)}
          onEndTest={() => handleEndExam("You have submitted and concluded the exam.")}
          isBlocked={isExamBlocked}
          isTimeExpired={isTimeExpired}
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
              <strong>Before starting the exam, you must enable your camera, enter fullscreen, and share your screen. All three are mandatory.</strong>
            </span>
          </div>

          <div className="card-container">
            {/* Camera Permission Item */}
            <div className="permission-item">
              <div className="permission-icon">↗</div>
              <div className="permission-content">
                <h3>Configure Camera</h3>
                <p>Camera access is required to take this exam.</p>
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
                <p>Fullscreen mode is required to take this exam.</p>
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

            <div className="divider" />

            {/* Screen Sharing Permission Item */}
            <div className="permission-item">
              <div className="permission-icon">🖥️</div>
              <div className="permission-content">
                <h3>Configure Screen Sharing</h3>
                <p>Screen sharing is required to take this exam. Please select a screen or window to share.</p>
                <div className="action-row">
                  <button onClick={handleOpenScreenPicker} className="btn btn-dark">
                    Enable Screen Sharing
                  </button>
                </div>

                <div
                  className={`status-badge ${
                    screenShareStatus === "Ready"
                      ? "status-ready"
                      : screenShareStatus === "Error"
                      ? "status-error"
                      : "status-not-ready"
                  }`}
                >
                  Screen Sharing Status: {screenShareStatus}
                </div>

                {selectedSourceName && screenShareStatus === "Ready" && (
                  <p className="selected-source-text">
                    Screen sharing is active. Selected: <strong>{selectedSourceName}</strong>
                  </p>
                )}

                {screenShareError && (
                  <div className="validation-error-box">{screenShareError}</div>
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
