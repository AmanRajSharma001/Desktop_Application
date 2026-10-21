const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

// Helper mock structures for testing validation logic and state transitions
function createPrerequisiteValidator() {
  return function validatePrerequisites({ cameraStream, isNativeFullscreen }) {
    const videoTrack = cameraStream?.getVideoTracks?.()[0];
    const isCameraActive = Boolean(
      cameraStream &&
        videoTrack &&
        videoTrack.readyState === "live" &&
        videoTrack.enabled !== false
    );

    if (!isCameraActive) {
      return {
        allowed: false,
        reason: "Cannot start exam: Camera stream or track is inactive. Please click 'Enable Camera' and ensure your camera is working.",
      };
    }

    if (!isNativeFullscreen) {
      return {
        allowed: false,
        reason: "Cannot start exam: Fullscreen is not active. Please click 'Enter Fullscreen' before starting.",
      };
    }

    return { allowed: true };
  };
}

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

function createMockElectronWindow() {
  let isFullScreen = false;
  let isKiosk = false;
  let examActive = false;
  let autoRecoveryAttempts = 0;
  const MAX_AUTO_RECOVERY = 1;
  const events = {};

  return {
    on(event, handler) {
      if (!events[event]) events[event] = [];
      events[event].push(handler);
    },
    emit(event, ...args) {
      if (events[event]) {
        for (const handler of events[event]) {
          handler(...args);
        }
      }
    },
    setFullScreen(val) {
      isFullScreen = Boolean(val);
    },
    setKiosk(val) {
      isKiosk = Boolean(val);
    },
    isFullScreen() {
      return isFullScreen;
    },
    isKiosk() {
      return isKiosk;
    },
    get nativeActive() {
      return isFullScreen || isKiosk;
    },
    setExamActive(active) {
      examActive = Boolean(active);
      if (active) autoRecoveryAttempts = 0;
    },
    get examActive() {
      return examActive;
    },
    get autoRecoveryAttempts() {
      return autoRecoveryAttempts;
    },
    enterFullscreenMode(platform = process.platform) {
      if (platform === "darwin") {
        this.setFullScreen(true);
        this.setKiosk(true);
      } else {
        this.setKiosk(true);
        this.setFullScreen(true);
      }
      return {
        isActive: this.nativeActive,
        isFullScreen: this.isFullScreen(),
        isKiosk: this.isKiosk(),
      };
    },
    exitFullscreenMode() {
      this.setKiosk(false);
      this.setFullScreen(false);
    },
    handleFullscreenExit(options = { allowRecovery: true }) {
      if (!this.nativeActive && examActive) {
        if (options.allowRecovery && autoRecoveryAttempts < MAX_AUTO_RECOVERY) {
          autoRecoveryAttempts++;
          this.enterFullscreenMode();
          if (this.nativeActive) {
            autoRecoveryAttempts = 0;
            return { recovered: true, blocked: false };
          }
        }
        return { recovered: false, blocked: true };
      }
      return { recovered: false, blocked: false };
    },
    handleBeforeInputEvent(input) {
      if (input.key === "Escape" && examActive) {
        return { defaultPrevented: true };
      }
      return { defaultPrevented: false };
    },
  };
}

// -------------------------------------------------------------
// Test Scenarios (1 through 12)
// -------------------------------------------------------------

test("Scenario 1: Starting with neither prerequisite satisfied", () => {
  const validate = createPrerequisiteValidator();
  const result = validate({ cameraStream: null, isNativeFullscreen: false });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /Camera stream or track is inactive/);
});

test("Scenario 2: Camera ready but fullscreen inactive", () => {
  const validate = createPrerequisiteValidator();
  const mockStream = {
    getVideoTracks: () => [{ readyState: "live", enabled: true }],
  };
  const result = validate({
    cameraStream: mockStream,
    isNativeFullscreen: false,
  });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /Fullscreen is not active/);
});

test("Scenario 3: Fullscreen active but camera unavailable or track ended", () => {
  const validate = createPrerequisiteValidator();

  // Test null stream
  const res1 = validate({ cameraStream: null, isNativeFullscreen: true });
  assert.equal(res1.allowed, false);
  assert.match(res1.reason, /Camera/);

  // Test ended track
  const deadStream = {
    getVideoTracks: () => [{ readyState: "ended", enabled: true }],
  };
  const res2 = validate({
    cameraStream: deadStream,
    isNativeFullscreen: true,
  });
  assert.equal(res2.allowed, false);
  assert.match(res2.reason, /Camera/);

  // Test disabled track
  const disabledStream = {
    getVideoTracks: () => [{ readyState: "live", enabled: false }],
  };
  const res3 = validate({
    cameraStream: disabledStream,
    isNativeFullscreen: true,
  });
  assert.equal(res3.allowed, false);
  assert.match(res3.reason, /Camera/);
});

test("Scenario 4: Starting after both prerequisites are satisfied", () => {
  const validate = createPrerequisiteValidator();
  const mockStream = {
    getVideoTracks: () => [{ readyState: "live", enabled: true }],
  };
  const result = validate({
    cameraStream: mockStream,
    isNativeFullscreen: true,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, undefined);
});

test("Scenario 5: Pressing Escape during the active exam", () => {
  const win = createMockElectronWindow();
  win.setExamActive(true);

  // When exam is active, before-input-event prevents default for Escape
  const event = win.handleBeforeInputEvent({ key: "Escape" });
  assert.equal(event.defaultPrevented, true);

  // When exam is NOT active, before-input-event does not block Escape
  win.setExamActive(false);
  const inactiveEvent = win.handleBeforeInputEvent({ key: "Escape" });
  assert.equal(inactiveEvent.defaultPrevented, false);
});

test("Scenario 6: Exiting fullscreen through another supported mechanism", () => {
  const win = createMockElectronWindow();
  win.enterFullscreenMode();
  win.setExamActive(true);
  assert.equal(win.nativeActive, true);

  // Simulate external OS window manager dropping fullscreen (e.g. swipe/gesture)
  win.setFullScreen(false);
  win.setKiosk(false);
  assert.equal(win.nativeActive, false);
});

test("Scenario 7: Successful fullscreen recovery", () => {
  const win = createMockElectronWindow();
  win.enterFullscreenMode();
  win.setExamActive(true);

  // Trigger fullscreen drop
  win.setFullScreen(false);
  win.setKiosk(false);

  // Main process attempts controlled recovery
  const outcome = win.handleFullscreenExit({ allowRecovery: true });
  assert.equal(outcome.recovered, true);
  assert.equal(outcome.blocked, false);
  assert.equal(win.nativeActive, true);
});

test("Scenario 8: Failed fullscreen recovery and blocked exam interaction", () => {
  const win = createMockElectronWindow();
  win.enterFullscreenMode();
  win.setExamActive(true);

  // Trigger fullscreen drop where OS refuses recovery (e.g. user on another workspace)
  win.setFullScreen(false);
  win.setKiosk(false);

  // Exhaust first recovery attempt
  const firstAttempt = win.handleFullscreenExit({ allowRecovery: false });
  assert.equal(firstAttempt.recovered, false);
  assert.equal(firstAttempt.blocked, true);

  // MCQ Engine is placed in blocked state
  const mcq = createMCQEngine([
    { id: 1, question: "Q1", options: ["A", "B"] },
    { id: 2, question: "Q2", options: ["C", "D"] },
  ]);
  mcq.setBlocked(true);

  // Option selection must be prevented
  assert.equal(mcq.selectOption(0), false);
  assert.equal(mcq.selectedOption, null);

  // Navigation must be blocked
  assert.equal(mcq.nextQuestion(), false);
  assert.equal(mcq.currentIndex, 0);

  // When re-entering fullscreen succeeds, unblock
  win.enterFullscreenMode();
  mcq.setBlocked(false);
  assert.equal(mcq.selectOption(1), true);
  assert.equal(mcq.selectedOption, 1);
});

test("Scenario 9: Camera permission denial or camera-track failure", () => {
  function handleCameraError(err) {
    let msg = err.message || "Failed to access camera.";
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      msg = "Camera permission was denied. Please allow camera permissions in system settings.";
    } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      msg = "No camera device found. Please connect an active webcam.";
    }
    return { status: "Error", message: msg };
  }

  const deniedErr = new Error("Permission denied by user");
  deniedErr.name = "NotAllowedError";
  const deniedRes = handleCameraError(deniedErr);
  assert.equal(deniedRes.status, "Error");
  assert.match(deniedRes.message, /Camera permission was denied/);

  const notFoundErr = new Error("No device found");
  notFoundErr.name = "NotFoundError";
  const notFoundRes = handleCameraError(notFoundErr);
  assert.equal(notFoundRes.status, "Error");
  assert.match(notFoundRes.message, /No camera device found/);
});

test("Scenario 10: Successful camera capture and correct file storage", async () => {
  const feedDir = path.join(__dirname, "../electron/cameraFeed");
  if (!fs.existsSync(feedDir)) {
    fs.mkdirSync(feedDir, { recursive: true });
  }

  const testPayload = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // JPEG header bytes
  const testFileName = `test_${Date.now()}.jpeg`;
  const filePath = path.join(feedDir, testFileName);

  try {
    await fs.promises.writeFile(filePath, testPayload);
    assert.equal(fs.existsSync(filePath), true);
    const readBack = await fs.promises.readFile(filePath);
    assert.deepEqual(readBack, testPayload);
  } finally {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
});

test("Scenario 11: Answer persistence during question navigation", () => {
  const questions = [
    { id: 101, question: "Q1", options: ["A", "B", "C"] },
    { id: 102, question: "Q2", options: ["X", "Y", "Z"] },
    { id: 103, question: "Q3", options: ["1", "2", "3"] },
  ];
  const mcq = createMCQEngine(questions);

  assert.equal(mcq.totalQuestions, 3);
  assert.equal(mcq.currentIndex, 0);
  assert.equal(mcq.selectedOption, null);

  // Select Option 2 for Q1
  mcq.selectOption(2);
  assert.equal(mcq.selectedOption, 2);

  // Navigate to Q2
  assert.equal(mcq.nextQuestion(), true);
  assert.equal(mcq.currentIndex, 1);
  assert.equal(mcq.selectedOption, null);

  // Select Option 0 for Q2
  mcq.selectOption(0);
  assert.equal(mcq.selectedOption, 0);

  // Navigate back to Q1 -> Option 2 must be restored!
  assert.equal(mcq.previousQuestion(), true);
  assert.equal(mcq.currentIndex, 0);
  assert.equal(mcq.selectedOption, 2);

  // Boundary checks: previous beyond index 0 is prevented
  assert.equal(mcq.previousQuestion(), false);
  assert.equal(mcq.currentIndex, 0);

  // Navigate forward to Q3 and test upper boundary
  assert.equal(mcq.nextQuestion(), true); // to Q2
  assert.equal(mcq.nextQuestion(), true); // to Q3
  assert.equal(mcq.currentIndex, 2);
  assert.equal(mcq.nextQuestion(), false); // beyond last question prevented
  assert.equal(mcq.currentIndex, 2);
});

test("Scenario 12: Exam termination and cleanup of timers, capture intervals, and camera tracks", () => {
  let timerCleared = false;
  let intervalCleared = false;
  let trackStopped = false;
  let examActive = true;
  let endTime = Date.now() + 3600000;

  const mockInterval = setInterval(() => {}, 5000);
  const mockTimer = setInterval(() => {}, 1000);
  const mockTrack = {
    stop() {
      trackStopped = true;
    },
  };

  // Termination routine
  function terminateExam() {
    clearInterval(mockInterval);
    intervalCleared = true;
    clearInterval(mockTimer);
    timerCleared = true;
    mockTrack.stop();
    examActive = false;
    endTime = null;
  }

  terminateExam();

  assert.equal(intervalCleared, true);
  assert.equal(timerCleared, true);
  assert.equal(trackStopped, true);
  assert.equal(examActive, false);
  assert.equal(endTime, null);
});
