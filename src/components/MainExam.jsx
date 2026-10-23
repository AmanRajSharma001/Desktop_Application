import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExamResults from "./ExamResults";

const sampleQuestions = [
  {
    id: 1,
    question: "Which Electron process is responsible for creating BrowserWindow?",
    options: ["Renderer Process", "Main Process", "React Process", "Preload Process"],
    correctAnswer: 1,
  },
  {
    id: 2,
    question: "Which Electron API is commonly used in the renderer to invoke a handler in the main process?",
    options: ["ipcRenderer.invoke", "BrowserWindow.loadURL", "fs.writeFileSync", "dialog.showMessageBox"],
    correctAnswer: 0,
  },
  {
    id: 3,
    question: "Why is a preload script commonly used in Electron?",
    options: ["To style the React application", "To expose controlled APIs safely to the renderer", "To create the Express server", "To replace the main process"],
    correctAnswer: 1,
  },
  {
    id: 4,
    question: "Which HTTP method is normally used to fetch exam questions?",
    options: ["GET", "DELETE", "PATCH", "CONNECT"],
    correctAnswer: 0,
  },
  {
    id: 5,
    question: "What does fs.writeFileSync() do?",
    options: ["Reads camera frames", "Writes data to a file synchronously", "Starts the Electron renderer", "Sends an IPC event"],
    correctAnswer: 1,
  },
];

function getInitialDraft() {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("athena_exam_draft");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.answers === "object") {
          return parsed;
        }
      }
    }
  } catch (e) {
    console.warn("Could not read draft from localStorage:", e);
  }
  return null;
}

function MainExam({ time, onEndTest, isBlocked = false, isTimeExpired = false }) {
  const initialDraft = useMemo(() => getInitialDraft(), []);
  const [questions, setQuestions] = useState(sampleQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState(() => initialDraft?.answers || {});
  const [sessionId, setSessionId] = useState(
    () => initialDraft?.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );

  // Loading & source metadata
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [questionSource, setQuestionSource] = useState("loading"); // "backend" | "fallback"
  const [loadNotice, setLoadNotice] = useState("");

  // Submission lifecycle states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [resultsData, setResultsData] = useState(null);

  // Concurrency guard ref
  const isSubmittingRef = useRef(false);
  const answersRef = useRef(answers);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const totalQuestions = questions.length;
  const safeCurrentIndex = Math.min(Math.max(0, currentIndex), Math.max(0, totalQuestions - 1));
  const currentQuestion = questions[safeCurrentIndex] || sampleQuestions[0];
  const questionId = currentQuestion ? currentQuestion.id : 1;
  const selectedOption = answers[questionId] !== undefined ? answers[questionId] : null;

  // Derived answer metrics
  const answeredCount = useMemo(() => {
    return Object.keys(answers).filter(
      (id) => answers[id] !== undefined && answers[id] !== null && answers[id] !== ""
    ).length;
  }, [answers]);

  const unansweredCount = Math.max(0, totalQuestions - answeredCount);

  // Persist draft answers to localStorage when answers change
  useEffect(() => {
    if (!isSubmitted && Object.keys(answers).length > 0) {
      try {
        localStorage.setItem(
          "athena_exam_draft",
          JSON.stringify({ sessionId, answers, updatedAt: Date.now() })
        );
      } catch (e) {
        console.warn("Failed to persist draft answers to localStorage:", e);
      }
    }
  }, [answers, sessionId, isSubmitted]);

  // Load questions from backend API with reliable fallback
  useEffect(() => {
    let active = true;

    // Initialize session with backend
    fetch("http://localhost:3000/exam/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.sessionId) {
          setSessionId(data.sessionId);
        }
      })
      .catch((err) => {
        console.warn("Backend session initialization skipped (offline):", err.message);
      });

    // Fetch questions from backend
    fetch("http://localhost:3000/exam/mcq/all")
      .then((res) => {
        if (!res.ok) throw new Error(`Backend returned status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data) && data.length > 0) {
          const validQuestions = data.filter(
            (q) => q && q.id !== undefined && q.question && Array.isArray(q.options) && q.options.length > 0
          );
          if (validQuestions.length > 0) {
            setQuestions(validQuestions);
            setQuestionSource("backend");
            setLoadNotice("Loaded directly from Athena Question Server.");
            setIsLoadingQuestions(false);
            return;
          }
        }
        throw new Error("Invalid or empty question dataset received from backend.");
      })
      .catch((err) => {
        if (!active) return;
        console.warn("Using offline fallback questions:", err.message);
        setQuestions(sampleQuestions);
        setQuestionSource("fallback");
        setLoadNotice("Using offline fallback questions (Athena backend is offline at localhost:3000).");
        setIsLoadingQuestions(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  // Handle option selection
  function handleOptionSelect(index) {
    if (isBlocked || isSubmitting || isSubmitted) return;
    setAnswers((prev) => ({
      ...prev,
      [questionId]: index,
    }));
  }

  function nextQuestion() {
    if (isBlocked || isSubmitting || isSubmitted) return;
    if (safeCurrentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }

  function previousQuestion() {
    if (isBlocked || isSubmitting || isSubmitted) return;
    if (safeCurrentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }

  function jumpToQuestion(idx) {
    if (isBlocked || isSubmitting || isSubmitted) return;
    if (idx >= 0 && idx < totalQuestions) {
      setCurrentIndex(idx);
    }
  }

  // Submit exam answers to backend
  const executeSubmission = useCallback(
    async ({ isAutoExpiry = false } = {}) => {
      if (isSubmittingRef.current || isSubmitted) return;
      isSubmittingRef.current = true;
      setIsSubmitting(true);
      setSubmissionError("");

      const currentAnswers = answersRef.current;
      const payload = {
        sessionId,
        answers: currentAnswers,
        submittedAt: Date.now(),
        isAutoExpiry,
      };

      try {
        const response = await fetch("http://localhost:3000/exam/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => null);

        if (response.ok && data && data.success) {
          // Successful backend submission
          try {
            localStorage.removeItem("athena_exam_draft");
          } catch {
            // ignore
          }
          setResultsData(data);
          setIsSubmitted(true);
          setShowConfirmModal(false);
          return;
        }

        // If backend returned duplicate submission conflict (409)
        if (response.status === 409 && data) {
          setResultsData({
            ...data,
            success: true,
            note: "Duplicate submission accepted. Displaying existing recorded attempt.",
          });
          setIsSubmitted(true);
          setShowConfirmModal(false);
          return;
        }

        // Backend returned an error response
        const errMsg = data?.error || `Server responded with HTTP ${response.status}`;
        throw new Error(errMsg);
      } catch (err) {
        console.warn("Backend submission failed, initiating reliable fallback evaluation:", err.message);

        // If backend is unreachable or offline, calculate transparent local evaluation
        const evaluatedReview = questions.map((q) => {
          const userAns = currentAnswers[q.id] !== undefined ? currentAnswers[q.id] : null;
          const isAnswered = userAns !== null && userAns !== undefined;
          const isCorrect = isAnswered && q.correctAnswer !== undefined && Number(userAns) === q.correctAnswer;
          return {
            questionId: q.id,
            question: q.question,
            options: q.options,
            selectedOption: userAns !== null ? Number(userAns) : null,
            correctOption: q.correctAnswer !== undefined ? q.correctAnswer : null,
            isCorrect: Boolean(isCorrect),
            explanation: q.explanation || "",
          };
        });

        const correct = evaluatedReview.filter((r) => r.isCorrect).length;
        const unanswered = evaluatedReview.filter((r) => r.selectedOption === null).length;
        const incorrect = totalQuestions - correct - unanswered;
        const pct = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;

        const fallbackResult = {
          success: true,
          isOffline: true,
          sessionId,
          submissionId: `sub_offline_${Date.now()}`,
          score: correct,
          totalQuestions,
          correctCount: correct,
          incorrectCount: incorrect,
          unansweredCount: unanswered,
          percentage: pct,
          submittedAt: Date.now(),
          status: "completed_offline",
          review: evaluatedReview,
          error: `Backend unreachable (${err.message}). Evaluated in offline mode.`,
        };

        setResultsData(fallbackResult);
        setIsSubmitted(true);
        setShowConfirmModal(false);
      } finally {
        setIsSubmitting(false);
        isSubmittingRef.current = false;
      }
    },
    [sessionId, isSubmitted, questions, totalQuestions]
  );

  // Timer expiration auto-submission trigger
  useEffect(() => {
    if (isTimeExpired && !isSubmitted && !isSubmittingRef.current) {
      console.log("Timer expired. Triggering automated exam submission...");
      executeSubmission({ isAutoExpiry: true });
    }
  }, [isTimeExpired, isSubmitted, executeSubmission]);

  // Open confirmation modal
  function handleRequestSubmit() {
    if (isBlocked || isSubmitting || isSubmitted) return;
    setShowConfirmModal(true);
  }

  // If already submitted, display Results view
  if (isSubmitted && resultsData) {
    return (
      <ExamResults
        result={resultsData}
        onExitExam={() => {
          if (onEndTest) {
            onEndTest();
          } else {
            window.location.reload();
          }
        }}
        onRetrySubmit={() => executeSubmission({ isAutoExpiry: false })}
        isRetrying={isSubmitting}
      />
    );
  }

  return (
    <div className={`exam-page ${isBlocked ? "exam-page-blocked" : ""}`}>
      {/* Submission Confirmation Modal */}
      {showConfirmModal && (
        <div className="submit-modal-overlay">
          <div className="submit-modal-card">
            <div className="submit-modal-icon">📝</div>
            <h2>Submit Examination?</h2>
            <p>
              Please review your completion status before finalizing your submission. Once submitted, you cannot change any answers.
            </p>

            <div className="submit-status-summary">
              <div className="summary-pill summary-answered">
                <span>Answered</span>
                <strong>{answeredCount}</strong>
              </div>
              <div className="summary-pill summary-unanswered">
                <span>Unanswered</span>
                <strong>{unansweredCount}</strong>
              </div>
              <div className="summary-pill summary-total">
                <span>Total</span>
                <strong>{totalQuestions}</strong>
              </div>
            </div>

            {unansweredCount > 0 && (
              <div className="modal-warning-box">
                ⚠️ You have <strong>{unansweredCount}</strong> unanswered question(s). Are you sure you wish to submit now?
              </div>
            )}

            {submissionError && (
              <div className="validation-error-box" style={{ marginBottom: "16px" }}>
                {submissionError}
              </div>
            )}

            <div className="submit-modal-actions">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="btn btn-outline"
              >
                Continue Exam
              </button>
              <button
                onClick={() => executeSubmission({ isAutoExpiry: false })}
                disabled={isSubmitting}
                className="btn btn-light-blue"
              >
                {isSubmitting ? "Submitting..." : "Confirm & Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submitting in-progress overlay */}
      {isSubmitting && !showConfirmModal && (
        <div className="recovery-overlay">
          <div className="recovery-card">
            <div className="recovery-icon">⏳</div>
            <h2>Submitting Exam...</h2>
            <p>Your answers are being securely submitted and evaluated by the Athena Examination Server. Please wait...</p>
          </div>
        </div>
      )}

      <div className="exam-container">
        {/* Exam Header */}
        <div className="exam-header">
          <div className="header-meta-group">
            <div className="exam-timer-badge">
              <span className="timer-icon">⏱️</span>
              <span className="timer-text">Time Left: {time}</span>
            </div>

            <div className="exam-progress-badge">
              Answered: <strong>{answeredCount}</strong> / {totalQuestions}
            </div>
          </div>

          <button
            className="end-test-btn"
            onClick={handleRequestSubmit}
            disabled={isBlocked || isSubmitting || isSubmitted}
          >
            End Test & Submit
          </button>
        </div>

        {/* Question Loading State */}
        {isLoadingQuestions ? (
          <div className="question-card" style={{ textAlign: "center", padding: "60px 20px" }}>
            <p style={{ fontSize: "17px", color: "#64748b" }}>Loading exam questions from server...</p>
          </div>
        ) : (
          <>
            {/* Question Source Banner */}
            <div className={`source-status-banner banner-${questionSource}`}>
              <span>{questionSource === "backend" ? "● Server Connected" : "▲ Offline Mode"}</span>
              <span className="source-notice-detail">{loadNotice}</span>
            </div>

            {/* Question Quick-Navigation Palette */}
            <div className="question-palette">
              <div className="palette-label">Questions:</div>
              <div className="palette-grid">
                {questions.map((q, idx) => {
                  const isAns = answers[q.id] !== undefined && answers[q.id] !== null;
                  const isCurrent = idx === safeCurrentIndex;
                  return (
                    <button
                      key={q.id || idx}
                      type="button"
                      onClick={() => jumpToQuestion(idx)}
                      disabled={isBlocked}
                      className={`palette-btn ${
                        isCurrent ? "palette-active" : isAns ? "palette-answered" : "palette-unanswered"
                      }`}
                      title={`Question ${idx + 1}${isAns ? " (Answered)" : " (Unanswered)"}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Question Card */}
            {currentQuestion && (
              <div className="question-card">
                <div className="question-card-header">
                  <h2>
                    Question {safeCurrentIndex + 1} of {totalQuestions}
                  </h2>
                  <span className={`question-status-tag ${selectedOption !== null ? "tag-answered" : "tag-unanswered"}`}>
                    {selectedOption !== null ? "Answered" : "Unanswered"}
                  </span>
                </div>

                <p className="question-text">{currentQuestion.question}</p>

                {/* Options */}
                {currentQuestion.options &&
                  currentQuestion.options.map((option, index) => (
                    <label
                      key={index}
                      className={`option-row ${
                        selectedOption === index ? "option-selected" : ""
                      } ${isBlocked ? "option-disabled" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`question-${questionId}`}
                        checked={selectedOption === index}
                        onChange={() => handleOptionSelect(index)}
                        disabled={isBlocked || isSubmitting || isSubmitted}
                      />
                      <span>{option}</span>
                    </label>
                  ))}

                {/* Navigation Buttons */}
                <div className="navigation-buttons">
                  <button
                    type="button"
                    onClick={previousQuestion}
                    disabled={safeCurrentIndex === 0 || isBlocked || isSubmitting}
                  >
                    Previous
                  </button>

                  <div className="nav-center-info">
                    {selectedOption !== null ? (
                      <span className="selected-indicator">Option {selectedOption + 1} selected</span>
                    ) : (
                      <span className="unselected-indicator">No option selected</span>
                    )}
                  </div>

                  {safeCurrentIndex < totalQuestions - 1 ? (
                    <button
                      type="button"
                      onClick={nextQuestion}
                      disabled={isBlocked || isSubmitting}
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRequestSubmit}
                      disabled={isBlocked || isSubmitting}
                      className="btn-submit-final"
                    >
                      Review & Submit
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default MainExam;
