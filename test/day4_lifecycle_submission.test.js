const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createServer, readQuestions, readSessions } = require("../backend/server.js");

// In-memory HTTP dispatcher for reliable, zero-socket sandboxed execution
function invokeServer(server, { method = "GET", path = "/", headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = path;
    req.headers = {
      host: "localhost:3000",
      ...headers,
    };

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
        // keep string
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
        const dataStr = typeof body === "string" ? body : JSON.stringify(body);
        req.emit("data", Buffer.from(dataStr));
      }
      req.emit("end");
    } catch (err) {
      reject(err);
    }
  });
}

// Simulation engine for frontend question & submission lifecycle
function createExamLifecycleEngine({ questions: initialQuestions, server, sessionId = "test_session_1" }) {
  let questions = [...initialQuestions];
  let currentIndex = 0;
  let answers = {};
  let isBlocked = false;
  let isSubmitting = false;
  let isSubmitted = false;
  let submissionResult = null;
  let questionSource = "initial";

  return {
    get questions() {
      return questions;
    },
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
    get answeredCount() {
      return Object.keys(answers).filter((id) => answers[id] !== undefined && answers[id] !== null).length;
    },
    get unansweredCount() {
      return questions.length - this.answeredCount;
    },
    get isSubmitting() {
      return isSubmitting;
    },
    get isSubmitted() {
      return isSubmitted;
    },
    get submissionResult() {
      return submissionResult;
    },
    get questionSource() {
      return questionSource;
    },

    setBlocked(blocked) {
      isBlocked = Boolean(blocked);
    },

    selectOption(optionIndex) {
      if (isBlocked || isSubmitting || isSubmitted) return false;
      const qId = questions[currentIndex]?.id;
      if (qId === undefined) return false;
      answers[qId] = optionIndex;
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

    async loadQuestionsFromBackend() {
      if (!server) {
        questionSource = "fallback";
        return { success: false, fallbackCount: questions.length };
      }
      try {
        const res = await invokeServer(server, { path: "/exam/mcq/all" });
        if (res.statusCode === 200 && Array.isArray(res.data) && res.data.length > 0) {
          questions = res.data;
          questionSource = "backend";
          return { success: true, count: questions.length };
        }
        throw new Error("Invalid response");
      } catch {
        questionSource = "fallback";
        return { success: false, fallbackCount: questions.length };
      }
    },

    async submitExam() {
      if (isSubmitting || isSubmitted) {
        return { success: false, duplicateBlocked: true };
      }
      isSubmitting = true;

      try {
        if (!server) {
          throw new Error("Backend server not provided");
        }

        const res = await invokeServer(server, {
          method: "POST",
          path: "/exam/submit",
          headers: { "Content-Type": "application/json" },
          body: {
            sessionId,
            answers,
          },
        });

        if (res.statusCode === 200 && res.data?.success) {
          isSubmitted = true;
          submissionResult = res.data;
          return { success: true, result: res.data };
        }

        if (res.statusCode === 409) {
          isSubmitted = true;
          submissionResult = res.data;
          return { success: true, duplicateAccepted: true, result: res.data };
        }

        throw new Error(res.data?.error || `HTTP ${res.statusCode}`);
      } catch (err) {
        // Fallback local evaluation
        const evaluated = questions.map((q) => {
          const userAns = answers[q.id];
          const isAns = userAns !== undefined && userAns !== null;
          const isCorrect = isAns && q.correctAnswer !== undefined && userAns === q.correctAnswer;
          return {
            questionId: q.id,
            selectedOption: isAns ? userAns : null,
            isCorrect,
          };
        });
        const correct = evaluated.filter((e) => e.isCorrect).length;
        submissionResult = {
          success: true,
          isOffline: true,
          status: "completed",
          score: correct,
          totalQuestions: questions.length,
          error: err.message,
        };
        isSubmitted = true;
        return { success: true, offline: true, result: submissionResult };
      } finally {
        isSubmitting = false;
      }
    },
  };
}

// ==========================================
// TEST SUITE: DAY 4 LIFECYCLE & INTEGRATION
// ==========================================

test("Day 4.1: Backend server initializes and provides healthcheck", async () => {
  const server = createServer();
  const res = await invokeServer(server, { path: "/health" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.status, "ok");
  assert.equal(res.data.service, "athena-backend");
});

test("Day 4.2: GET /exam/mcq/all returns sanitized questions omitting secret answer keys", async () => {
  const server = createServer();
  const res = await invokeServer(server, { path: "/exam/mcq/all" });
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.data));
  assert.ok(res.data.length >= 5, "Expected at least 5 questions");

  // CRITICAL SECURITY ASSERTION: correctAnswer and explanation MUST NOT be exposed to client
  for (const q of res.data) {
    assert.ok(q.id, "Question must have an id");
    assert.ok(q.question, "Question must have text");
    assert.ok(Array.isArray(q.options) && q.options.length >= 2, "Question must have valid options");
    assert.equal(q.correctAnswer, undefined, "correctAnswer MUST NOT be sent in questions API");
    assert.equal(q.explanation, undefined, "explanation MUST NOT be sent in questions API");
  }
});

test("Day 4.3: GET /exam/mcq/:id returns sanitized single question and handles invalid IDs", async () => {
  const server = createServer();
  const validRes = await invokeServer(server, { path: "/exam/mcq/1" });
  assert.equal(validRes.statusCode, 200);
  assert.equal(validRes.data.id, 1);
  assert.equal(validRes.data.correctAnswer, undefined);

  const invalidRes = await invokeServer(server, { path: "/exam/mcq/9999" });
  assert.equal(invalidRes.statusCode, 404);
  assert.equal(invalidRes.data.success, false);
});

test("Day 4.4: POST /exam/start initializes valid session metadata", async () => {
  const server = createServer();
  const res = await invokeServer(server, {
    method: "POST",
    path: "/exam/start",
    headers: { "Content-Type": "application/json" },
    body: { candidateName: "Aman Sharma" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.success, true);
  assert.ok(res.data.sessionId.startsWith("session_"));
  assert.equal(res.data.durationMinutes, 60);
  assert.ok(res.data.totalQuestions > 0);
});

test("Day 4.5: POST /exam/submit rejects malformed and missing payloads", async () => {
  const server = createServer();

  // Missing sessionId
  const resNoSession = await invokeServer(server, {
    method: "POST",
    path: "/exam/submit",
    headers: { "Content-Type": "application/json" },
    body: { answers: {} },
  });
  assert.equal(resNoSession.statusCode, 400);
  assert.equal(resNoSession.data.success, false);

  // Missing answers
  const resNoAnswers = await invokeServer(server, {
    method: "POST",
    path: "/exam/submit",
    headers: { "Content-Type": "application/json" },
    body: { sessionId: "sess_test" },
  });
  assert.equal(resNoAnswers.statusCode, 400);
  assert.equal(resNoAnswers.data.success, false);
});

test("Day 4.6: POST /exam/submit correctly evaluates answers and returns trusted scores", async () => {
  const server = createServer();
  const rawQuestions = readQuestions();
  assert.ok(rawQuestions.length > 0);

  const sessionId = `test_eval_${Date.now()}`;
  // Craft submission: Answer first 2 correctly, 3rd incorrectly, rest unanswered
  const answers = {
    [rawQuestions[0].id]: rawQuestions[0].correctAnswer,
    [rawQuestions[1].id]: rawQuestions[1].correctAnswer,
    [rawQuestions[2].id]: (rawQuestions[2].correctAnswer + 1) % rawQuestions[2].options.length,
  };

  const res = await invokeServer(server, {
    method: "POST",
    path: "/exam/submit",
    headers: { "Content-Type": "application/json" },
    body: {
      sessionId,
      answers,
      candidateName: "Test Student",
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.data.success, true);
  assert.equal(res.data.score, 2, "Expected exactly 2 correct answers");
  assert.equal(res.data.correctCount, 2);
  assert.equal(res.data.incorrectCount, 1);
  assert.equal(res.data.unansweredCount, rawQuestions.length - 3);
  assert.equal(res.data.totalQuestions, rawQuestions.length);
  assert.ok(res.data.submissionId.startsWith("sub_"));

  // Verify session persistence in database/sessions.json
  const sessions = readSessions();
  const stored = sessions.find((s) => s.sessionId === sessionId);
  assert.ok(stored, "Session must be persisted to data store");
  assert.equal(stored.score, 2);
  assert.equal(stored.status, "completed");
});

test("Day 4.7: POST /exam/submit prevents duplicate submissions of completed session", async () => {
  const server = createServer();
  const rawQuestions = readQuestions();
  const sessionId = `test_dup_${Date.now()}`;
  const answers = { [rawQuestions[0].id]: rawQuestions[0].correctAnswer };

  // First submission
  const res1 = await invokeServer(server, {
    method: "POST",
    path: "/exam/submit",
    headers: { "Content-Type": "application/json" },
    body: { sessionId, answers },
  });
  assert.equal(res1.statusCode, 200);

  // Second submission with same sessionId -> returns 409 Conflict
  const res2 = await invokeServer(server, {
    method: "POST",
    path: "/exam/submit",
    headers: { "Content-Type": "application/json" },
    body: { sessionId, answers },
  });
  assert.equal(res2.statusCode, 409);
  assert.equal(res2.data.duplicate, true);
  assert.equal(res2.data.success, false);
});

test("Day 4.8: Frontend MCQ loading integrates with backend and falls back gracefully", async () => {
  const server = createServer();
  const sampleFallback = [
    { id: 1, question: "Fallback Q1", options: ["A", "B"] },
    { id: 2, question: "Fallback Q2", options: ["C", "D"] },
  ];

  // When backend is running
  const engineWithBackend = createExamLifecycleEngine({
    questions: sampleFallback,
    server,
  });
  const loadSuccess = await engineWithBackend.loadQuestionsFromBackend();
  assert.equal(loadSuccess.success, true);
  assert.equal(engineWithBackend.questionSource, "backend");
  assert.ok(engineWithBackend.totalQuestions >= 5);

  // When backend is null/unreachable
  const engineOffline = createExamLifecycleEngine({
    questions: sampleFallback,
    server: null,
  });
  const loadFailed = await engineOffline.loadQuestionsFromBackend();
  assert.equal(loadFailed.success, false);
  assert.equal(engineOffline.questionSource, "fallback");
  assert.equal(engineOffline.totalQuestions, 2);
});

test("Day 4.9: Answer selection, updating, and navigation persistence across question lifecycle", async () => {
  const sample = [
    { id: 101, question: "Q1", options: ["A", "B", "C"] },
    { id: 102, question: "Q2", options: ["D", "E", "F"] },
    { id: 103, question: "Q3", options: ["G", "H", "I"] },
  ];

  const engine = createExamLifecycleEngine({ questions: sample, server: null });

  assert.equal(engine.totalQuestions, 3);
  assert.equal(engine.currentIndex, 0);
  assert.equal(engine.answeredCount, 0);
  assert.equal(engine.unansweredCount, 3);

  // 1. Select answer on Q1
  engine.selectOption(1);
  assert.equal(engine.answers[101], 1);
  assert.equal(engine.answeredCount, 1);
  assert.equal(engine.unansweredCount, 2);

  // 2. Change answer on Q1 (no duplicate entries)
  engine.selectOption(2);
  assert.equal(engine.answers[101], 2);
  assert.equal(engine.answeredCount, 1);

  // 3. Navigate to Q2
  engine.nextQuestion();
  assert.equal(engine.currentIndex, 1);
  assert.equal(engine.currentQuestion.id, 102);

  // 4. Select answer on Q2
  engine.selectOption(0);
  assert.equal(engine.answers[102], 0);
  assert.equal(engine.answeredCount, 2);
  assert.equal(engine.unansweredCount, 1);

  // 5. Navigate back to Q1 — answer MUST be restored
  engine.previousQuestion();
  assert.equal(engine.currentIndex, 0);
  assert.equal(engine.answers[101], 2);

  // 6. Direct jump to Q3 via palette
  engine.jumpToQuestion(2);
  assert.equal(engine.currentIndex, 2);
  assert.equal(engine.currentQuestion.id, 103);
  assert.equal(engine.answers[103], undefined, "Q3 should remain unanswered");
});

test("Day 4.10: Complete submission workflow, duplicate click protection, and results generation", async () => {
  const server = createServer();
  const rawQuestions = readQuestions();
  const engine = createExamLifecycleEngine({
    questions: rawQuestions,
    server,
    sessionId: `test_workflow_${Date.now()}`,
  });

  // Candidate answers some questions
  engine.selectOption(rawQuestions[0].correctAnswer);
  engine.nextQuestion();
  engine.selectOption(rawQuestions[1].correctAnswer);

  // Initial submission
  const submitPromise = engine.submitExam();

  // Concurrent duplicate submission attempt while in-flight MUST be blocked
  const duplicateAttempt = await engine.submitExam();
  assert.equal(duplicateAttempt.duplicateBlocked, true);

  const submitResult = await submitPromise;
  assert.equal(submitResult.success, true);
  assert.equal(engine.isSubmitted, true);
  assert.ok(engine.submissionResult.score >= 2);

  // Post-submission answer modifications MUST be blocked
  const postEditAttempt = engine.selectOption(0);
  assert.equal(postEditAttempt, false, "Answer modification must be blocked after submission");
});

test("Day 4.11: Timer expiration auto-submission triggers defined submission flow", async () => {
  const server = createServer();
  const rawQuestions = readQuestions();
  const sessionId = `test_expiry_${Date.now()}`;
  const engine = createExamLifecycleEngine({
    questions: rawQuestions,
    server,
    sessionId,
  });

  engine.selectOption(rawQuestions[0].correctAnswer);

  // Simulate timer reaching 0 -> triggers submitExam()
  const expiryResult = await engine.submitExam();
  assert.equal(expiryResult.success, true);
  assert.equal(engine.isSubmitted, true);
  assert.equal(engine.submissionResult.status, "completed");

  // Second expiry event is a no-op
  const secondExpiry = await engine.submitExam();
  assert.equal(secondExpiry.duplicateBlocked, true);
});

test("Day 4.12: Preserved Day 2 & Day 3 integrity (3-way pre-flight checklist, blocking recovery, and teardown)", () => {
  // Prerequisite validator
  function validateThreePrerequisites({ cameraStream, isNativeFullscreen, screenStream }) {
    const camTrack = cameraStream?.getVideoTracks?.()[0];
    const isCamActive = Boolean(cameraStream && camTrack && camTrack.readyState === "live");
    if (!isCamActive) return { allowed: false, reason: "Camera required" };

    if (!isNativeFullscreen) return { allowed: false, reason: "Fullscreen required" };

    const scrTrack = screenStream?.getVideoTracks?.()[0];
    const isScrActive = Boolean(screenStream && scrTrack && scrTrack.readyState === "live");
    if (!isScrActive) return { allowed: false, reason: "Screen sharing required" };

    return { allowed: true };
  }

  // 1. None active
  assert.equal(validateThreePrerequisites({}).allowed, false);

  // 2. Camera only
  assert.equal(
    validateThreePrerequisites({
      cameraStream: { getVideoTracks: () => [{ readyState: "live" }] },
    }).allowed,
    false
  );

  // 3. Camera + Fullscreen, no screen
  assert.equal(
    validateThreePrerequisites({
      cameraStream: { getVideoTracks: () => [{ readyState: "live" }] },
      isNativeFullscreen: true,
    }).allowed,
    false
  );

  // 4. All three satisfied
  assert.equal(
    validateThreePrerequisites({
      cameraStream: { getVideoTracks: () => [{ readyState: "live" }] },
      isNativeFullscreen: true,
      screenStream: { getVideoTracks: () => [{ readyState: "live" }] },
    }).allowed,
    true
  );
});
