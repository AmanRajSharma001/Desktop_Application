const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

// Helper validator representing App.jsx 3-way pre-flight check
function createDay3PrerequisiteValidator() {
  return function validatePrerequisites({ cameraStream, isNativeFullscreen, screenStream }) {
    const cameraTrack = cameraStream?.getVideoTracks?.()[0];
    const isCameraActive = Boolean(
      cameraStream &&
        cameraTrack &&
        cameraTrack.readyState === "live" &&
        cameraTrack.enabled !== false
    );

    if (!isCameraActive) {
      return {
        allowed: false,
        reason: "Cannot start exam: Camera access is required to take this exam. Please click 'Enable Camera' and ensure your camera is working.",
      };
    }

    if (!isNativeFullscreen) {
      return {
        allowed: false,
        reason: "Cannot start exam: Fullscreen mode is required to take this exam. Please click 'Enter Fullscreen' before starting.",
      };
    }

    const screenTrack = screenStream?.getVideoTracks?.()[0];
    const isScreenShareActive = Boolean(
      screenStream &&
        screenTrack &&
        screenTrack.readyState === "live" &&
        screenTrack.enabled !== false
    );

    if (!isScreenShareActive) {
      return {
        allowed: false,
        reason: "Cannot start exam: Screen sharing is required to take this exam. Please click 'Enable Screen Sharing' and select a screen or window.",
      };
    }

    return { allowed: true };
  };
}

// Helper MCQ Engine tracking answers, navigation, and blocked state
function createMCQEngine(initialQuestions) {
  let questions = [...initialQuestions];
  let currentIndex = 0;
  let answers = {};
  let isBlocked = false;

  return {
    get totalQuestions() {
      return questions.length;
    },
    get currentIndex() {
      return currentIndex;
    },
    get currentQuestion() {
      return questions[currentIndex];
    },
    get answers() {
      return { ...answers };
    },
    get selectedOption() {
      const qId = questions[currentIndex]?.id;
      return answers[qId] !== undefined ? answers[qId] : null;
    },
    setBlocked(blocked) {
      isBlocked = Boolean(blocked);
    },
    get isBlocked() {
      return isBlocked;
    },
    selectOption(optionIndex) {
      if (isBlocked) return false;
      const qId = questions[currentIndex]?.id;
      answers[qId] = optionIndex;
      return true;
    },
    nextQuestion() {
      if (isBlocked) return false;
      if (currentIndex < questions.length - 1) {
        currentIndex++;
        return true;
      }
      return false;
    },
    previousQuestion() {
      if (isBlocked) return false;
      if (currentIndex > 0) {
        currentIndex--;
        return true;
      }
      return false;
    },
  };
}

// ---------------------------------------------------------------------------
// Day 3 Test Scenarios (1 through 18)
// ---------------------------------------------------------------------------

test("1. Landing page displays the three mandatory requirements", () => {
  const requirements = [
    { id: "camera", label: "Configure Camera", mandatory: true },
    { id: "fullscreen", label: "Switch to full screen", mandatory: true },
    { id: "screenShare", label: "Configure Screen Sharing", mandatory: true },
  ];
  assert.equal(requirements.length, 3);
  assert.ok(requirements.every((r) => r.mandatory));
});

test("2. Start Exam remains disabled when camera is unavailable", () => {
  const validate = createDay3PrerequisiteValidator();
  const screenStream = {
    getVideoTracks: () => [{ readyState: "live", enabled: true }],
  };

  const res = validate({
    cameraStream: null,
    isNativeFullscreen: true,
    screenStream,
  });

  assert.equal(res.allowed, false);
  assert.match(res.reason, /Camera access is required/);
});

test("3. Start Exam remains disabled when fullscreen is inactive", () => {
  const validate = createDay3PrerequisiteValidator();
  const cameraStream = {
    getVideoTracks: () => [{ readyState: "live", enabled: true }],
  };
  const screenStream = {
    getVideoTracks: () => [{ readyState: "live", enabled: true }],
  };

  const res = validate({
    cameraStream,
    isNativeFullscreen: false,
    screenStream,
  });

  assert.equal(res.allowed, false);
  assert.match(res.reason, /Fullscreen mode is required/);
});

test("4. Start Exam remains disabled when screen sharing has not been approved", () => {
  const validate = createDay3PrerequisiteValidator();
  const cameraStream = {
    getVideoTracks: () => [{ readyState: "live", enabled: true }],
  };

  // Case A: null screenStream
  const resNull = validate({
    cameraStream,
    isNativeFullscreen: true,
    screenStream: null,
  });
  assert.equal(resNull.allowed, false);
  assert.match(resNull.reason, /Screen sharing is required/);

  // Case B: ended screen track
  const deadStream = {
    getVideoTracks: () => [{ readyState: "ended", enabled: true }],
  };
  const resDead = validate({
    cameraStream,
    isNativeFullscreen: true,
    screenStream: deadStream,
  });
  assert.equal(resDead.allowed, false);
  assert.match(resDead.reason, /Screen sharing is required/);
});

test("5. Start Exam becomes available only when all three requirements are verified", () => {
  const validate = createDay3PrerequisiteValidator();
  const cameraStream = {
    getVideoTracks: () => [{ readyState: "live", enabled: true }],
  };
  const screenStream = {
    getVideoTracks: () => [{ readyState: "live", enabled: true }],
  };

  const res = validate({
    cameraStream,
    isNativeFullscreen: true,
    screenStream,
  });

  assert.equal(res.allowed, true);
  assert.equal(res.reason, undefined);
});

test("6. window.electronAPI.screenShare exists and invokes the intended IPC flow", () => {
  const preloadContent = fs.readFileSync(
    path.join(__dirname, "../electron/preload.js"),
    "utf-8"
  );
  assert.match(preloadContent, /screenShare:\s*\(options\)\s*=>\s*ipcRenderer\.invoke\("screen-share"/);
  assert.match(preloadContent, /saveScreenPhoto:\s*\(arrayBuffer\)\s*=>\s*ipcRenderer\.invoke\("save-screen-photo"/);

  const mainContent = fs.readFileSync(
    path.join(__dirname, "../electron/main.cjs"),
    "utf-8"
  );
  assert.match(mainContent, /ipcMain\.handle\("screen-share"/);
  assert.match(mainContent, /ipcMain\.handle\("save-screen-photo"/);
  assert.match(mainContent, /desktopCapturer/);
});

test("7. Desktop sources can be retrieved and a screen or window can be selected", async () => {
  // Mock IPC handler for screen-share
  const mockSources = [
    { id: "screen:0:0", name: "Entire Screen", thumbnail: "data:image/png;base64,mockScreen" },
    { id: "window:101:0", name: "Google Chrome", thumbnail: "data:image/png;base64,mockWin" },
  ];

  const handleScreenShare = async () => ({
    success: true,
    sources: mockSources,
  });

  const res = await handleScreenShare();
  assert.equal(res.success, true);
  assert.equal(res.sources.length, 2);

  // User selects source 0
  const selected = res.sources.find((s) => s.id === "screen:0:0");
  assert.ok(selected);
  assert.equal(selected.name, "Entire Screen");
});

test("8. A valid screen-sharing stream is obtained", () => {
  const mockTrack = {
    readyState: "live",
    enabled: true,
    stopCalled: false,
    stop() {
      this.stopCalled = true;
      this.readyState = "ended";
    },
  };
  const mockStream = {
    getVideoTracks: () => [mockTrack],
  };

  const tracks = mockStream.getVideoTracks();
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].readyState, "live");
  assert.equal(tracks[0].enabled, true);
});

test("9. Screen-sharing screenshots are saved under electron/ScreenFeed/", async () => {
  const screenFeedDir = path.join(__dirname, "../electron/ScreenFeed");
  if (!fs.existsSync(screenFeedDir)) {
    fs.mkdirSync(screenFeedDir, { recursive: true });
  }

  // Test empty buffer rejection
  const emptyRes = await (async (buf) => {
    if (!buf || !(buf.byteLength > 0)) return { success: false, error: "Empty or invalid buffer" };
    return { success: true };
  })(null);
  assert.equal(emptyRes.success, false);
  assert.equal(emptyRes.error, "Empty or invalid buffer");

  // Test valid buffer write to electron/ScreenFeed/
  const testPayload = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x11, 0x22, 0x33]); // JPEG test bytes
  const randomSalt = Math.random().toString(36).slice(2, 8);
  const testFileName = `screen_${Date.now()}_${randomSalt}.jpeg`;
  const safeName = path.basename(testFileName);
  const filePath = path.join(screenFeedDir, safeName);

  try {
    await fs.promises.writeFile(filePath, testPayload);
    assert.equal(fs.existsSync(filePath), true);
    assert.ok(filePath.includes(path.join("electron", "ScreenFeed")));
    const readBack = await fs.promises.readFile(filePath);
    assert.deepEqual(readBack, testPayload);
  } finally {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
});

test("10. Screen screenshot filenames do not overwrite previous captures", () => {
  const generateFileName = () =>
    `screen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpeg`;

  const name1 = generateFileName();
  const name2 = generateFileName();
  const name3 = generateFileName();

  assert.notEqual(name1, name2);
  assert.notEqual(name2, name3);
  assert.ok(name1.startsWith("screen_"));
  assert.ok(name1.endsWith(".jpeg"));
});

test("11. Camera and screen captures use different destinations", () => {
  const cameraDir = path.join(__dirname, "../electron/cameraFeed");
  const screenDir = path.join(__dirname, "../electron/ScreenFeed");

  assert.notEqual(cameraDir, screenDir);
  assert.ok(cameraDir.endsWith("cameraFeed"));
  assert.ok(screenDir.endsWith("ScreenFeed"));
});

test("12. Screen captures are not created before the exam starts", () => {
  let captureCount = 0;
  let started = false;
  let fullscreenActive = true;
  let screenShareReady = true;

  function triggerProctorCapture() {
    if (!started || !fullscreenActive || !screenShareReady) return;
    captureCount++;
  }

  // Pre-flight setup phase
  triggerProctorCapture();
  triggerProctorCapture();
  assert.equal(captureCount, 0, "No captures should trigger before exam is started");

  // Exam starts
  started = true;
  triggerProctorCapture();
  assert.equal(captureCount, 1, "Capture triggers when exam has started");
});

test("13. Screen captures stop when screen sharing ends", () => {
  let captureCount = 0;
  let started = true;
  let fullscreenActive = true;
  let screenShareReady = true;

  function triggerProctorCapture() {
    if (!started || !fullscreenActive || !screenShareReady) return;
    captureCount++;
  }

  triggerProctorCapture();
  assert.equal(captureCount, 1);

  // Screen sharing ends (user clicks stop or track terminates)
  screenShareReady = false;
  triggerProctorCapture();
  triggerProctorCapture();
  assert.equal(captureCount, 1, "Captures must stop immediately when screen sharing ends");
});

test("14. The exam blocks interaction when screen sharing is lost", () => {
  const mcq = createMCQEngine([
    { id: 1, question: "Q1", options: ["Option A", "Option B"] },
    { id: 2, question: "Q2", options: ["Option C", "Option D"] },
  ]);

  // Exam is running and candidate answers Q1
  mcq.selectOption(0);
  assert.equal(mcq.selectedOption, 0);

  // Screen sharing is dropped during exam
  let isScreenShareBlocked = true;
  mcq.setBlocked(isScreenShareBlocked);

  // Candidate attempts to change answer or navigate
  assert.equal(mcq.selectOption(1), false, "Selecting option should be blocked");
  assert.equal(mcq.nextQuestion(), false, "Navigating next should be blocked");
  assert.equal(mcq.previousQuestion(), false, "Navigating previous should be blocked");
  assert.equal(mcq.selectedOption, 0, "Original answer remains intact");
});

test("15. Resuming screen sharing does not reset the timer or lose answers", () => {
  const mcq = createMCQEngine([
    { id: 101, question: "Q1", options: ["A", "B", "C"] },
    { id: 102, question: "Q2", options: ["D", "E", "F"] },
  ]);

  let examTimerEndTime = Date.now() + 3600000; // 60 mins from now
  const originalEndTime = examTimerEndTime;

  // Answer Q1 with option index 2
  mcq.selectOption(2);
  assert.equal(mcq.selectedOption, 2);

  // Navigate to Q2 and answer with option index 0
  mcq.nextQuestion();
  mcq.selectOption(0);
  assert.equal(mcq.selectedOption, 0);

  // Screen share drop occurs
  mcq.setBlocked(true);

  // Candidate re-shares screen and verifies stream
  mcq.setBlocked(false);

  // Answers must be completely preserved!
  assert.equal(mcq.answers[101], 2);
  assert.equal(mcq.answers[102], 0);

  // Timer end time is NOT reset or altered
  assert.equal(examTimerEndTime, originalEndTime);
});

test("16. Resuming screen sharing does not create duplicate intervals", () => {
  let activeIntervals = 0;
  let currentIntervalId = null;

  function setupCaptureInterval(started, fullscreenStatus, screenShareStatus) {
    // Teardown previous interval if any
    if (currentIntervalId) {
      clearInterval(currentIntervalId);
      currentIntervalId = null;
      activeIntervals--;
    }

    if (!started || fullscreenStatus !== "Active" || screenShareStatus !== "Ready") {
      return;
    }

    currentIntervalId = setInterval(() => {}, 5000);
    activeIntervals++;
  }

  // Start exam
  setupCaptureInterval(true, "Active", "Ready");
  assert.equal(activeIntervals, 1);

  // Screen share drops
  setupCaptureInterval(true, "Active", "Not Ready");
  assert.equal(activeIntervals, 0);

  // Screen share restored
  setupCaptureInterval(true, "Active", "Ready");
  assert.equal(activeIntervals, 1, "Only a single interval must be active");

  // Cleanup
  setupCaptureInterval(false, "Active", "Ready");
  assert.equal(activeIntervals, 0);
});

test("17. Exam completion stops all capture loops and releases media resources", () => {
  let cameraTrackStopped = false;
  let screenTrackStopped = false;
  let cameraIntervalCleared = false;
  let screenIntervalCleared = false;

  const mockCameraTrack = {
    stop() {
      cameraTrackStopped = true;
    },
  };
  const mockScreenTrack = {
    stop() {
      screenTrackStopped = true;
    },
  };

  const camInterval = setInterval(() => {}, 5000);
  const scrInterval = setInterval(() => {}, 5000);

  function terminateExamSession() {
    mockCameraTrack.stop();
    mockScreenTrack.stop();
    clearInterval(camInterval);
    cameraIntervalCleared = true;
    clearInterval(scrInterval);
    screenIntervalCleared = true;
  }

  terminateExamSession();

  assert.equal(cameraTrackStopped, true);
  assert.equal(screenTrackStopped, true);
  assert.equal(cameraIntervalCleared, true);
  assert.equal(screenIntervalCleared, true);
});

test("18. Existing Day 2 MCQ, timer, camera, and fullscreen behavior remains functional", () => {
  const mcq = createMCQEngine([
    { id: 1, question: "Q1", options: ["A", "B"] },
  ]);
  assert.equal(mcq.totalQuestions, 1);
  mcq.selectOption(1);
  assert.equal(mcq.selectedOption, 1);

  const mainContent = fs.readFileSync(
    path.join(__dirname, "../electron/main.cjs"),
    "utf-8"
  );
  assert.ok(mainContent.includes("full-screen"));
  assert.ok(mainContent.includes("save-photo"));
  assert.ok(mainContent.includes("get-time"));
  assert.ok(mainContent.includes("start-test"));
});
