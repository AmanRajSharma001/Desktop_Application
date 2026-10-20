import { useEffect, useRef, useState } from "react";
import "./App.css";
import MainExam from "./components/MainExam";

function App() {
  const videoRef = useRef(null);
  const imageCaptureRef = useRef(null);

  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  async function getLaspedTime() {
    if (window.electronAPI && window.electronAPI.getRemainingTime) {
      const currTime = await window.electronAPI.getRemainingTime();
      setTime(currTime);
    }
  }

  useEffect(() => {
    if (!started) return;

    const interval = setInterval(() => {
      getLaspedTime();
    }, 1000);

    return () => clearInterval(interval);
  }, [started]);

  async function getCamera() {
    try {
      const videoData = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = videoData;
      }

      const track = videoData.getVideoTracks()[0];
      if (typeof ImageCapture !== "undefined") {
        imageCaptureRef.current = new ImageCapture(track);
      }
      setCameraReady(true);
    } catch (err) {
      console.warn("Camera access not granted or not available:", err);
      setCameraReady(true);
    }
  }

  async function clickPhoto() {
    try {
      if (imageCaptureRef.current && typeof imageCaptureRef.current.takePhoto === "function") {
        const blob = await imageCaptureRef.current.takePhoto();
        const buffer = await blob.arrayBuffer();
        if (window.electronAPI && window.electronAPI.savePhoto) {
          await window.electronAPI.savePhoto(buffer);
        }
      }
    } catch (err) {
      console.warn("Snapshot capture error:", err);
    }
  }

  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      clickPhoto();
    }, 5000);

    return () => {
      clearInterval(id);
    };
  }, [started]);

  async function getFullscreen() {
    if (window.electronAPI && window.electronAPI.setFullScreen) {
      await window.electronAPI.setFullScreen();
    }
  }

  async function startTest() {
    if (window.electronAPI && window.electronAPI.showExamRules) {
      const res = await window.electronAPI.showExamRules();
      if (res === 0 || res === 1) {
        if (window.electronAPI.startTest) {
          await window.electronAPI.startTest();
        }
        setStarted(true);
      }
    } else {
      setStarted(true);
    }
  }

  function formatTimeLeft(ms) {
    const seconds = Math.floor((ms / 1000) % 60)
      .toString()
      .padStart(2, "0");

    const minutes = Math.floor((ms / (1000 * 60)) % 60)
      .toString()
      .padStart(2, "0");

    const hours = Math.floor(ms / (1000 * 60 * 60))
      .toString()
      .padStart(2, "0");

    return `${hours}:${minutes}:${seconds}`;
  }

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        muted
        className={cameraReady && !started ? "video-preview" : "hidden-video"}
      />

      {started ? (
        <MainExam
          time={formatTimeLeft(time)}
          onEndTest={() => setStarted(false)}
        />
      ) : (
        <div className="page-container">
          <div className="header-section">
            <h1>Hi User!</h1>
            <p>Kindly Allow the following Permissions to Start the test:</p>
          </div>

          <div className="card-container">
            <div className="permission-item">
              <div className="permission-icon">↗</div>
              <div className="permission-content">
                <h3>Configure Camera</h3>
                <p>Kindly configure Camera to attempt quiz/contests.</p>
                <div className="action-row">
                  <button onClick={getCamera} className="btn btn-dark">
                    Get Camera Access
                  </button>
                </div>
                {cameraReady && <div className="camera-space" />}
              </div>
            </div>

            <div className="divider" />

            {/* Fullscreen */}
            <div className="permission-item">
              <div className="permission-icon">⛶</div>
              <div className="permission-content">
                <h3>Switch to full screen</h3>
                <p>Kindly close all tabs and switch to full screen.</p>
                <button onClick={getFullscreen} className="btn btn-light-blue">
                  Give Full Screen Permissions
                </button>
              </div>
            </div>
          </div>

          <div className="bottom-actions">
            <button onClick={startTest} className="btn btn-light-blue">
              Go To Test
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
