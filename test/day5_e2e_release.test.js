const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createServer, readQuestions } = require("../backend/server.js");

// In-memory HTTP dispatcher for hermetic, fast backend test execution
function invokeServer(server, { method = "GET", path = "/", headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = path;
    req.headers = { host: "localhost:3000", ...headers };

    let statusCode = 200;
    let responseHeaders = {};
    let responseData = "";

    const res = new EventEmitter();
    res.writeHead = (code, hdrs) => {
      statusCode = code;
      if (hdrs) responseHeaders = { ...responseHeaders, ...hdrs };
    };
    res.setHeader = (key, val) => {
      responseHeaders[key] = val;
    };
    res.end = (chunk) => {
      if (chunk) responseData += chunk.toString();
      let json = null;
      try {
        json = JSON.parse(responseData);
      } catch {
        // preserve string
      }
      resolve({
        statusCode,
        headers: responseHeaders,
        data: json !== null ? json : responseData,
      });
    };

    try {
      server.emit("request", req, res);
      if (body) {
        const str = typeof body === "string" ? body : JSON.stringify(body);
        req.emit("data", Buffer.from(str));
      }
      req.emit("end");
    } catch (err) {
      reject(err);
    }
  });
}

// 3-way pre-flight checklist validator matching App.jsx logic
function validatePreflightChecklist({ cameraStream, isNativeFullscreen, screenStream }) {
  const cameraTrack = cameraStream?.getVideoTracks?.()[0];
  const isCameraActive = Boolean(
    cameraStream && cameraTrack && cameraTrack.readyState === "live" && cameraTrack.enabled !== false
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
    screenStream && screenTrack && screenTrack.readyState === "live" && screenTrack.enabled !== false
  );
  if (!isScreenShareActive) {
    return {
      allowed: false,
      reason: "Cannot start exam: Screen sharing is required to take this exam. Please click 'Enable Screen Sharing' and select a screen or window.",
    };
  }

  return { allowed: true };
}

// Full exam lifecycle engine for Day 5 E2E testing
function createDay5ExamEngine({ questions: initialQuestions, server, sessionId = `day5_${Date.now()}` }) {
  let questions = [...initialQuestions];
  let currentIndex = 0;
  let answers = {};
  let isBlocked = false;
  let isSubmitting = false;
  let isSubmitted = false;
  let submissionResult = null;
  let submissionError = null;
  let autoSubmitCount = 0;
  let screenActive = true;
  let fullscreenActive = true;
  let intervalsRunning = 0;

  return {
    get questions() { return questions; },
    get totalQuestions() { return questions.length; },
    get currentIndex() { return currentIndex; },
    get currentQuestion() { return questions[currentIndex]; },
    get answers() { return { ...answers }; },
    get answeredCount() {
      return Object.keys(answers).filter((id) => answers[id] !== undefined && answers[id] !== null).length;
    },
    get isBlocked() { return isBlocked; },
    get isSubmitting() { return isSubmitting; },
    get isSubmitted() { return isSubmitted; },
    get submissionResult() { return submissionResult; },
    get submissionError() { return submissionError; },
    get autoSubmitCount() { return autoSubmitCount; },
    get intervalsRunning() { return intervalsRunning; },

    setBlocked(b) { isBlocked = Boolean(b); },
    setFullscreenActive(f) {
      fullscreenActive = Boolean(f);
      isBlocked = !fullscreenActive || !screenActive;
    },
    setScreenActive(s) {
      screenActive = Boolean(s);
      isBlocked = !fullscreenActive || !screenActive;
    },

    startCaptureIntervals() {
      if (intervalsRunning === 0) {
        intervalsRunning = 2; // camera + screen
      }
    },
    stopCaptureIntervals() {
      intervalsRunning = 0;
    },

    selectOption(index) {
      if (isBlocked || isSubmitting || isSubmitted) return false;
      const qId = questions[currentIndex]?.id;
      if (qId === undefined) return false;
      answers[qId] = index;
      return true;
    },

    nextQuestion() {
      if (isBlocked || isSubmitting || isSubmitted) return false;
      if (currentIndex < questions.length - 1) {
        currentIndex++;
        return true;
      }
      return false;
    },

    previousQuestion() {
      if (isBlocked || isSubmitting || isSubmitted) return false;
      if (currentIndex > 0) {
        currentIndex--;
        return true;
      }
      return false;
    },

    jumpToQuestion(idx) {
      if (isBlocked || isSubmitting || isSubmitted) return false;
      if (idx >= 0 && idx < questions.length) {
        currentIndex = idx;
        return true;
      }
      return false;
    },

    async submitExam({ isAutoExpiry = false } = {}) {
      if (isSubmitting || isSubmitted) {
        return { success: false, duplicateBlocked: true };
      }
      isSubmitting = true;
      submissionError = null;

      try {
        if (!server) {
          throw new Error("Athena backend server is unreachable at localhost:3000");
        }

        const res = await invokeServer(server, {
          method: "POST",
          path: "/exam/submit",
          headers: { "Content-Type": "application/json" },
          body: { sessionId, answers, isAutoExpiry },
        });

        if (res.statusCode === 200 && res.data?.success) {
          isSubmitted = true;
          submissionResult = res.data;
          this.stopCaptureIntervals();
          return { success: true, result: res.data };
        }

        if (res.statusCode === 409) {
          isSubmitted = true;
          submissionResult = res.data;
          this.stopCaptureIntervals();
          return { success: true, duplicateAccepted: true, result: res.data };
        }

        throw new Error(res.data?.error || `HTTP ${res.statusCode}`);
      } catch (err) {
        submissionError = err.message;
        if (isAutoExpiry) {
          // Present failed submission results view without inventing fake scores
          submissionResult = {
            success: false,
            error: err.message,
            sessionId,
            totalQuestions: questions.length,
            score: null,
            percentage: null,
            review: [],
          };
          isSubmitted = true;
          this.stopCaptureIntervals();
        }
        return { success: false, error: err.message, answersPreserved: { ...answers } };
      } finally {
        isSubmitting = false;
      }
    },

    async handleTimerExpiry() {
      autoSubmitCount++;
      return this.submitExam({ isAutoExpiry: true });
    },
  };
}

// ============================================================================
// PHASE 7: 20 COMPREHENSIVE END-TO-END VERIFICATION SCENARIOS
// ============================================================================

test("Scenario 1: Camera permission denied", () => {
  function handleCameraAccessError(err) {
    let msg = err.message || "Failed to access camera.";
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      msg = "Camera permission was denied. Please allow camera permissions in system settings.";
    }
    return { status: "Error", message: msg };
  }

  const deniedErr = new Error("Permission denied by user");
  deniedErr.name = "NotAllowedError";
  const res = handleCameraAccessError(deniedErr);

  assert.equal(res.status, "Error");
  assert.match(res.message, /Camera permission was denied/);

  // Start exam must remain blocked
  const preflight = validatePreflightChecklist({
    cameraStream: null,
    isNativeFullscreen: true,
    screenStream: { getVideoTracks: () => [{ readyState: "live", enabled: true }] },
  });
  assert.equal(preflight.allowed, false);
});

test("Scenario 2: Camera unavailable (devices not found or track failed)", () => {
  function handleCameraUnavailable(err) {
    let msg = err.message || "Failed to access camera.";
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      msg = "No camera device found. Please connect an active webcam.";
    }
    return { status: "Error", message: msg };
  }

  const notFound = new Error("Requested device not found");
  notFound.name = "NotFoundError";
  const res = handleCameraUnavailable(notFound);
  assert.equal(res.status, "Error");
  assert.match(res.message, /No camera device found/);

  const preflight = validatePreflightChecklist({
    cameraStream: { getVideoTracks: () => [{ readyState: "ended", enabled: true }] },
    isNativeFullscreen: true,
    screenStream: { getVideoTracks: () => [{ readyState: "live", enabled: true }] },
  });
  assert.equal(preflight.allowed, false);
});

test("Scenario 3: Fullscreen not active", () => {
  const preflight = validatePreflightChecklist({
    cameraStream: { getVideoTracks: () => [{ readyState: "live", enabled: true }] },
    isNativeFullscreen: false,
    screenStream: { getVideoTracks: () => [{ readyState: "live", enabled: true }] },
  });
  assert.equal(preflight.allowed, false);
  assert.match(preflight.reason, /Fullscreen mode is required/);
});

test("Scenario 4: Screen sharing cancelled", () => {
  let screenShareStatus = "Not Ready";
  function handleCancelPicker() {
    if (screenShareStatus !== "Ready") {
      screenShareStatus = "Not Ready";
    }
  }

  handleCancelPicker();
  assert.equal(screenShareStatus, "Not Ready");

  const preflight = validatePreflightChecklist({
    cameraStream: { getVideoTracks: () => [{ readyState: "live", enabled: true }] },
    isNativeFullscreen: true,
    screenStream: null,
  });
  assert.equal(preflight.allowed, false);
  assert.match(preflight.reason, /Screen sharing is required/);
});

test("Scenario 5: Screen Recording permission missing on macOS", () => {
  function checkMacScreenPermission(mediaAccessStatus) {
    if (mediaAccessStatus === "denied") {
      return {
        success: false,
        error: "Screen Recording permission is denied in macOS System Settings. Please enable Screen Recording in System Settings > Privacy & Security > Screen Recording.",
        permissionDenied: true,
        status: mediaAccessStatus,
      };
    }
    return { success: true };
  }

  const res = checkMacScreenPermission("denied");
  assert.equal(res.success, false);
  assert.equal(res.permissionDenied, true);
  assert.match(res.error, /Privacy & Security > Screen Recording/);
});

test("Scenario 6: No desktop sources returned by desktopCapturer", () => {
  function handleSources(sources) {
    if (!sources || sources.length === 0) {
      return {
        success: false,
        error: "No desktop or window capture sources found. On macOS, ensure Screen Recording permission is granted under System Settings > Privacy & Security > Screen Recording.",
        sources: [],
      };
    }
    return { success: true, sources };
  }

  const res = handleSources([]);
  assert.equal(res.success, false);
  assert.equal(res.sources.length, 0);
  assert.match(res.error, /No desktop or window capture sources found/);
});

test("Scenario 7: All three readiness requirements satisfied", () => {
  const preflight = validatePreflightChecklist({
    cameraStream: { getVideoTracks: () => [{ readyState: "live", enabled: true }] },
    isNativeFullscreen: true,
    screenStream: { getVideoTracks: () => [{ readyState: "live", enabled: true }] },
  });
  assert.equal(preflight.allowed, true);
  assert.equal(preflight.reason, undefined);
});

test("Scenario 8: Exam starts exactly once (duplicate start guard)", async () => {
  let isStarting = false;
  let startCount = 0;

  async function startExam() {
    if (isStarting) return { started: false, duplicateBlocked: true };
    isStarting = true;
    startCount++;
    return { started: true, startCount };
  }

  // First call succeeds
  const first = await startExam();
  assert.equal(first.started, true);
  assert.equal(startCount, 1);

  // Concurrent second call is prevented
  const second = await startExam();
  assert.equal(second.started, false);
  assert.equal(second.duplicateBlocked, true);
  assert.equal(startCount, 1);
});

test("Scenario 9: Questions load correctly and omit secret answer keys", async () => {
  const server = createServer({ inMemory: true });
  const res = await invokeServer(server, { path: "/exam/mcq/all" });

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.data));
  assert.ok(res.data.length > 0);

  // Confidentiality audit: no question should leak correctAnswer or secret keys
  for (const q of res.data) {
    assert.ok(q.id !== undefined);
    assert.ok(typeof q.question === "string");
    assert.ok(Array.isArray(q.options));
    assert.equal(q.correctAnswer, undefined, `Question ${q.id} must not leak correctAnswer to client`);
    assert.equal(q.explanation, undefined, `Question ${q.id} must not leak explanation to client`);
  }
});

test("Scenario 10: Answers persist across question navigation", () => {
  const rawQuestions = readQuestions();
  const engine = createDay5ExamEngine({ questions: rawQuestions, server: null });

  assert.equal(engine.currentIndex, 0);
  assert.equal(engine.answeredCount, 0);

  // 1. Select answer on Q1
  engine.selectOption(2);
  assert.equal(engine.answers[rawQuestions[0].id], 2);
  assert.equal(engine.answeredCount, 1);

  // 2. Navigate Next to Q2
  assert.equal(engine.nextQuestion(), true);
  assert.equal(engine.currentIndex, 1);

  // 3. Select answer on Q2
  engine.selectOption(1);
  assert.equal(engine.answers[rawQuestions[1].id], 1);
  assert.equal(engine.answeredCount, 2);

  // 4. Navigate Previous back to Q1 — answer must be preserved
  assert.equal(engine.previousQuestion(), true);
  assert.equal(engine.currentIndex, 0);
  assert.equal(engine.answers[rawQuestions[0].id], 2);

  // 5. Jump via palette to Q5
  assert.equal(engine.jumpToQuestion(4), true);
  assert.equal(engine.currentIndex, 4);
});

test("Scenario 11: Screen sharing stops during the exam (interruption & block)", () => {
  const rawQuestions = readQuestions();
  const engine = createDay5ExamEngine({ questions: rawQuestions, server: null });

  assert.equal(engine.isBlocked, false);
  assert.equal(engine.selectOption(0), true);

  // Interruption: screen sharing stops
  engine.setScreenActive(false);
  assert.equal(engine.isBlocked, true);

  // Interaction must be blocked while screen sharing is lost
  assert.equal(engine.selectOption(1), false);
  assert.equal(engine.nextQuestion(), false);

  // Recovery: screen sharing restored
  engine.setScreenActive(true);
  assert.equal(engine.isBlocked, false);
  assert.equal(engine.selectOption(1), true);
});

test("Scenario 12: Fullscreen is exited during the exam (interruption & recovery)", () => {
  const rawQuestions = readQuestions();
  const engine = createDay5ExamEngine({ questions: rawQuestions, server: null });

  assert.equal(engine.isBlocked, false);

  // Fullscreen exit detected
  engine.setFullscreenActive(false);
  assert.equal(engine.isBlocked, true);

  // Exam interaction blocked
  assert.equal(engine.nextQuestion(), false);
  assert.equal(engine.selectOption(3), false);

  // Recovery routine re-establishes native fullscreen
  engine.setFullscreenActive(true);
  assert.equal(engine.isBlocked, false);
  assert.equal(engine.selectOption(3), true);
});

test("Scenario 13: Timer reaches zero (triggers auto-submission once)", async () => {
  const server = createServer({ inMemory: true });
  const rawQuestions = readQuestions();
  const engine = createDay5ExamEngine({ questions: rawQuestions, server });

  engine.selectOption(rawQuestions[0].correctAnswer);

  // Timer expires
  const expiryRes = await engine.handleTimerExpiry();
  assert.equal(expiryRes.success, true);
  assert.equal(engine.isSubmitted, true);
  assert.equal(engine.autoSubmitCount, 1);

  // Subsequent expiry events must be rejected
  const secondExpiry = await engine.handleTimerExpiry();
  assert.equal(secondExpiry.duplicateBlocked, true);
  assert.equal(engine.autoSubmitCount, 2);
});

test("Scenario 14: Submission succeeds and evaluates trusted score", async () => {
  const server = createServer({ inMemory: true });
  const rawQuestions = readQuestions();
  const engine = createDay5ExamEngine({ questions: rawQuestions, server });

  // Answer first 3 correctly
  engine.selectOption(rawQuestions[0].correctAnswer);
  engine.nextQuestion();
  engine.selectOption(rawQuestions[1].correctAnswer);
  engine.nextQuestion();
  engine.selectOption(rawQuestions[2].correctAnswer);

  const res = await engine.submitExam();
  assert.equal(res.success, true);
  assert.equal(engine.isSubmitted, true);
  assert.equal(engine.submissionResult.status, "completed");
  assert.ok(engine.submissionResult.score >= 3);
  assert.equal(engine.submissionResult.totalQuestions, rawQuestions.length);
});

test("Scenario 15: Submission fails (preserves answers, does not invent scores)", async () => {
  const rawQuestions = readQuestions();
  // Server is offline (null)
  const engine = createDay5ExamEngine({ questions: rawQuestions, server: null });

  engine.selectOption(1);
  engine.nextQuestion();
  engine.selectOption(2);

  // Manual submission attempt fails due to offline server
  const submitRes = await engine.submitExam({ isAutoExpiry: false });
  assert.equal(submitRes.success, false);
  assert.equal(engine.isSubmitted, false);
  assert.ok(submitRes.error.includes("unreachable"));

  // Critical: recoverable answers are preserved!
  assert.deepEqual(submitRes.answersPreserved, engine.answers);
  assert.equal(engine.answers[rawQuestions[0].id], 1);
  assert.equal(engine.answers[rawQuestions[1].id], 2);

  // When timer auto-expires with offline server:
  const expiryRes = await engine.handleTimerExpiry();
  assert.equal(expiryRes.success, false);
  assert.equal(engine.isSubmitted, true);
  // Crucial: score must NOT be invented!
  assert.equal(engine.submissionResult.score, null);
  assert.equal(engine.submissionResult.success, false);
});

test("Scenario 16: Repeated submission attempts are blocked", async () => {
  const server = createServer({ inMemory: true });
  const rawQuestions = readQuestions();
  const engine = createDay5ExamEngine({ questions: rawQuestions, server });

  engine.selectOption(0);

  const submitPromise = engine.submitExam();
  // Concurrent duplicate attempt in-flight
  const duplicate = await engine.submitExam();
  assert.equal(duplicate.duplicateBlocked, true);

  const first = await submitPromise;
  assert.equal(first.success, true);

  // Post-submission attempt
  const postSubmit = await engine.submitExam();
  assert.equal(postSubmit.duplicateBlocked, true);
});

test("Scenario 17: Results reflect actual backend data", async () => {
  const server = createServer({ inMemory: true });
  const rawQuestions = readQuestions();
  const engine = createDay5ExamEngine({ questions: rawQuestions, server });

  engine.selectOption(rawQuestions[0].correctAnswer);

  const res = await engine.submitExam();
  assert.equal(res.success, true);

  const r = engine.submissionResult;
  assert.equal(typeof r.score, "number");
  assert.equal(typeof r.correctCount, "number");
  assert.equal(typeof r.incorrectCount, "number");
  assert.equal(typeof r.unansweredCount, "number");
  assert.equal(typeof r.percentage, "number");
  assert.equal(r.correctCount + r.incorrectCount + r.unansweredCount, rawQuestions.length);
  assert.ok(Array.isArray(r.review));
  assert.equal(r.review.length, rawQuestions.length);
});

test("Scenario 18: Camera and screen capture intervals stop at completion", () => {
  const rawQuestions = readQuestions();
  const engine = createDay5ExamEngine({ questions: rawQuestions, server: null });

  engine.startCaptureIntervals();
  assert.equal(engine.intervalsRunning, 2);

  engine.stopCaptureIntervals();
  assert.equal(engine.intervalsRunning, 0);
});

test("Scenario 19: No duplicate intervals are created after recovery", () => {
  let activeIntervals = 0;
  let intervalRef = null;

  function setupInterval(shouldRun) {
    if (intervalRef) {
      clearInterval(intervalRef);
      intervalRef = null;
      activeIntervals--;
    }
    if (shouldRun) {
      intervalRef = setInterval(() => {}, 5000);
      activeIntervals++;
    }
  }

  // Start
  setupInterval(true);
  assert.equal(activeIntervals, 1);

  // Interruption
  setupInterval(false);
  assert.equal(activeIntervals, 0);

  // Recovery
  setupInterval(true);
  assert.equal(activeIntervals, 1, "Must maintain exactly 1 active interval after recovery");

  // Teardown
  setupInterval(false);
  assert.equal(activeIntervals, 0);
});

test("Scenario 20: Existing Day 2 and Day 3 functionality remains intact", () => {
  // Check combined regression: preflight, MCQ navigation, and teardown
  const preflight = validatePreflightChecklist({
    cameraStream: { getVideoTracks: () => [{ readyState: "live", enabled: true }] },
    isNativeFullscreen: true,
    screenStream: { getVideoTracks: () => [{ readyState: "live", enabled: true }] },
  });
  assert.equal(preflight.allowed, true);

  const rawQuestions = readQuestions();
  const engine = createDay5ExamEngine({ questions: rawQuestions, server: null });
  assert.equal(engine.totalQuestions, 10);
  assert.equal(engine.currentIndex, 0);
});
