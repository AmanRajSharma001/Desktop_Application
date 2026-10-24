const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const url = require("node:url");

const DATA_DIR = path.join(__dirname, "data");
const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SESSIONS_FILE)) {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify([], null, 2), "utf8");
  }
}

function readQuestions() {
  try {
    if (!fs.existsSync(QUESTIONS_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(QUESTIONS_FILE, "utf8");
    if (!raw || !raw.trim()) {
      return [];
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading questions:", err.message);
    return [];
  }
}

function readSessions() {
  try {
    ensureDataFiles();
    const raw = fs.readFileSync(SESSIONS_FILE, "utf8");
    if (!raw || !raw.trim()) {
      return [];
    }
    return JSON.parse(raw);
  } catch (err) {
    try {
      const rawRetry = fs.readFileSync(SESSIONS_FILE, "utf8");
      if (rawRetry && rawRetry.trim()) {
        return JSON.parse(rawRetry);
      }
    } catch {
      // ignore retry failure
    }
    console.error("Error reading sessions:", err.message);
    return [];
  }
}

function writeSessions(sessions) {
  try {
    ensureDataFiles();
    const tmpPath = `${SESSIONS_FILE}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(sessions, null, 2), "utf8");
    fs.renameSync(tmpPath, SESSIONS_FILE);
    return true;
  } catch (err) {
    console.error("Error writing sessions:", err.message);
    return false;
  }
}

function sanitizeQuestionForClient(q) {
  return {
    id: q.id,
    question: q.question,
    options: q.options || [],
  };
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message, details = null) {
  sendJson(res, statusCode, {
    success: false,
    error: message,
    ...(details ? { details } : {}),
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // 1MB safety limit
      if (body.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Malformed JSON body: ${err.message}`));
      }
    });
    req.on("error", (err) => reject(err));
  });
}

function createServer(options = {}) {
  ensureDataFiles();
  const inMemory = Boolean(options.inMemory);
  let localSessions = inMemory ? (options.initialSessions ? [...options.initialSessions] : []) : null;

  function getSessions() {
    if (inMemory) return localSessions;
    return readSessions();
  }

  function saveSessions(sessions) {
    if (inMemory) {
      localSessions = sessions;
      return true;
    }
    return writeSessions(sessions);
  }

  return http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers?.host || "localhost:3000"}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // Handle CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      });
      res.end();
      return;
    }

    try {
      // Healthcheck
      if ((pathname === "/health" || pathname === "/") && method === "GET") {
        return sendJson(res, 200, {
          status: "ok",
          service: "athena-backend",
          timestamp: Date.now(),
        });
      }

      // GET /exam/mcq/all — load all questions (sanitized)
      if (pathname === "/exam/mcq/all" && method === "GET") {
        const questions = readQuestions();
        const clientQuestions = questions.map(sanitizeQuestionForClient);
        return sendJson(res, 200, clientQuestions);
      }

      // GET /exam/mcq (with ?id=...) or GET /exam/mcq/:id
      if (pathname.startsWith("/exam/mcq") && method === "GET") {
        const questions = readQuestions();
        let targetId = null;

        if (parsedUrl.searchParams && parsedUrl.searchParams.get("id")) {
          targetId = parseInt(parsedUrl.searchParams.get("id"), 10);
        } else {
          const parts = pathname.split("/").filter(Boolean);
          // e.g. ["exam", "mcq", "1"]
          if (parts.length === 3 && parts[2] !== "all") {
            targetId = parseInt(parts[2], 10);
          }
        }

        if (targetId !== null && !isNaN(targetId)) {
          const found = questions.find((q) => q.id === targetId);
          if (found) {
            return sendJson(res, 200, sanitizeQuestionForClient(found));
          }
          return sendError(res, 404, `Question with ID ${targetId} not found`);
        }

        // If no ID specified and not /all, return all sanitized
        return sendJson(res, 200, questions.map(sanitizeQuestionForClient));
      }

      // POST /exam/start — initialize exam session
      if (pathname === "/exam/start" && method === "POST") {
        const body = await parseJsonBody(req);
        const questions = readQuestions();
        const sessionId = body.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const candidateName = body.candidateName || "Candidate";

        const sessionRecord = {
          sessionId,
          candidateName,
          status: "in-progress",
          startedAt: Date.now(),
          durationMinutes: 60,
          totalQuestions: questions.length,
        };

        const sessions = getSessions();
        const existingIdx = sessions.findIndex((s) => s.sessionId === sessionId);
        if (existingIdx >= 0) {
          sessions[existingIdx] = { ...sessions[existingIdx], ...sessionRecord };
        } else {
          sessions.push(sessionRecord);
        }
        saveSessions(sessions);

        return sendJson(res, 200, {
          success: true,
          sessionId,
          examId: "athena-exam-2026",
          startTime: sessionRecord.startedAt,
          durationMinutes: 60,
          totalQuestions: questions.length,
        });
      }

      // POST /exam/submit — submit and evaluate exam answers
      if (pathname === "/exam/submit" && method === "POST") {
        let body;
        try {
          body = await parseJsonBody(req);
        } catch (err) {
          return sendError(res, 400, err.message);
        }

        const { sessionId, answers, candidateName } = body;

        if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
          return sendError(res, 400, "Missing or invalid 'sessionId' in submission request.");
        }

        if (!answers || typeof answers !== "object") {
          return sendError(res, 400, "Missing or invalid 'answers' payload. Expected an object.");
        }

        const sessions = getSessions();
        const existingSession = sessions.find((s) => s.sessionId === sessionId);

        // Guard against duplicate submission of an already completed session
        if (existingSession && existingSession.status === "completed") {
          return sendJson(res, 409, {
            success: false,
            error: "This exam session has already been submitted.",
            duplicate: true,
            submissionId: existingSession.submissionId,
            score: existingSession.score,
            totalQuestions: existingSession.totalQuestions,
            submittedAt: existingSession.submittedAt,
          });
        }

        const questions = readQuestions();
        const totalQuestions = questions.length;
        let score = 0;
        let correctCount = 0;
        let incorrectCount = 0;
        let unansweredCount = 0;

        const review = questions.map((q) => {
          const clientAnswer = answers[q.id] !== undefined ? answers[q.id] : answers[String(q.id)];
          const isAnswered = clientAnswer !== undefined && clientAnswer !== null && clientAnswer !== "";
          const isCorrect = isAnswered && Number(clientAnswer) === q.correctAnswer;

          if (!isAnswered) {
            unansweredCount++;
          } else if (isCorrect) {
            correctCount++;
            score++;
          } else {
            incorrectCount++;
          }

          return {
            questionId: q.id,
            question: q.question,
            options: q.options,
            selectedOption: isAnswered ? Number(clientAnswer) : null,
            correctOption: q.correctAnswer,
            isCorrect: Boolean(isCorrect),
            explanation: q.explanation || "",
          };
        });

        const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
        const submissionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const submittedAt = Date.now();

        const completedRecord = {
          sessionId,
          submissionId,
          candidateName: candidateName || existingSession?.candidateName || "Candidate",
          status: "completed",
          startedAt: existingSession?.startedAt || submittedAt - 60000,
          submittedAt,
          answers,
          score,
          totalQuestions,
          correctCount,
          incorrectCount,
          unansweredCount,
          percentage,
          review,
        };

        if (existingSession) {
          const idx = sessions.findIndex((s) => s.sessionId === sessionId);
          sessions[idx] = completedRecord;
        } else {
          sessions.push(completedRecord);
        }
        saveSessions(sessions);

        return sendJson(res, 200, {
          success: true,
          sessionId,
          submissionId,
          score,
          totalQuestions,
          correctCount,
          incorrectCount,
          unansweredCount,
          percentage,
          submittedAt,
          status: "completed",
          review,
        });
      }

      // GET /exam/session/:sessionId — get session results
      if (pathname.startsWith("/exam/session/") && method === "GET") {
        const parts = pathname.split("/").filter(Boolean);
        const reqSessionId = parts[2];
        if (!reqSessionId) {
          return sendError(res, 400, "Missing sessionId in URL");
        }
        const sessions = getSessions();
        const found = sessions.find((s) => s.sessionId === reqSessionId);
        if (found) {
          return sendJson(res, 200, found);
        }
        return sendError(res, 404, `Session '${reqSessionId}' not found`);
      }

      // 404 fallback
      return sendError(res, 404, `Route ${method} ${pathname} not found`);
    } catch (err) {
      console.error("Internal Server Error:", err);
      return sendError(res, 500, "Internal Server Error");
    }
  });
}

function startServer(port = process.env.PORT || 3000) {
  const server = createServer();
  server.listen(port, () => {
    console.log(`Athena Exam Backend running at http://localhost:${port}/`);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createServer,
  startServer,
  readQuestions,
  readSessions,
  writeSessions,
};
