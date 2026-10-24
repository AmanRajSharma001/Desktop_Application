function ExamResults({ result, onExitExam, onRetrySubmit, isRetrying = false }) {
  if (!result) return null;

  const {
    success = true,
    error,
    score = 0,
    totalQuestions = 0,
    correctCount = 0,
    incorrectCount = 0,
    unansweredCount = 0,
    percentage = 0,
    submissionId,
    sessionId,
    submittedAt,
    review = [],
    isOffline = false,
  } = result;

  const formattedDate = submittedAt ? new Date(submittedAt).toLocaleTimeString() : "Just now";

  return (
    <div className="results-container">
      <div className="results-card">
        {/* Results Header */}
        <div className="results-header">
          <div className={`results-status-icon ${success ? "icon-success" : "icon-warning"}`}>
            {success ? "✓" : "!"}
          </div>
          <h2>{success ? "Exam Completed & Submitted" : "Submission Needs Attention"}</h2>
          <p className="results-subtitle">
            {isOffline
              ? "Your assessment concluded in offline fallback mode. Results evaluated locally."
              : success
              ? "Your responses have been recorded and evaluated by the Athena Examination Server."
              : "We encountered an issue submitting your exam to the backend server."}
          </p>

          {error && (
            <div className="results-error-alert">
              <strong>Submission Error:</strong> {error}
            </div>
          )}
        </div>

        {/* Score & Key Metrics Section */}
        {success && score !== null ? (
          <>
            <div className="score-hero">
              <div className="score-pill">
                <span className="score-big">{score}</span>
                <span className="score-total">/ {totalQuestions}</span>
              </div>
              <div className="score-percentage-label">
                Score: <strong>{percentage}%</strong>
              </div>
            </div>

            {/* Detailed Stats Grid */}
            <div className="results-metrics-grid">
              <div className="metric-box">
                <span className="metric-label">Total Questions</span>
                <span className="metric-value">{totalQuestions}</span>
              </div>
              <div className="metric-box metric-answered">
                <span className="metric-label">Answered</span>
                <span className="metric-value">{totalQuestions - unansweredCount}</span>
              </div>
              <div className="metric-box metric-unanswered">
                <span className="metric-label">Unanswered</span>
                <span className="metric-value">{unansweredCount}</span>
              </div>
              <div className="metric-box metric-correct">
                <span className="metric-label">Correct</span>
                <span className="metric-value">{correctCount}</span>
              </div>
              <div className="metric-box metric-incorrect">
                <span className="metric-label">Incorrect</span>
                <span className="metric-value">{incorrectCount}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="score-hero" style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
            <div className="score-pill" style={{ color: "#d97706" }}>
              <span className="score-big" style={{ fontSize: "28px" }}>Evaluation Pending</span>
            </div>
            <div className="score-percentage-label" style={{ color: "#92400e" }}>
              Your answers have been preserved. Please retry submission to connect to the evaluation server.
            </div>
          </div>
        )}

        {/* Metadata info */}
        <div className="results-meta-row">
          {sessionId && <span>Session: <code>{sessionId}</code></span>}
          {submissionId && <span>Submission ID: <code>{submissionId}</code></span>}
          <span>Submitted at: {formattedDate}</span>
        </div>

        {/* Question Review Breakdown */}
        {review && review.length > 0 && (
          <div className="results-review-section">
            <h3>Question Breakdown</h3>
            <div className="review-list">
              {review.map((item, idx) => {
                const isAnswered = item.selectedOption !== null && item.selectedOption !== undefined;
                return (
                  <div
                    key={item.questionId || idx}
                    className={`review-item ${
                      !isAnswered
                        ? "review-item-unanswered"
                        : item.isCorrect
                        ? "review-item-correct"
                        : "review-item-incorrect"
                    }`}
                  >
                    <div className="review-item-header">
                      <span className="review-item-number">Question {idx + 1}</span>
                      <span
                        className={`review-badge ${
                          !isAnswered
                            ? "badge-unanswered"
                            : item.isCorrect
                            ? "badge-correct"
                            : "badge-incorrect"
                        }`}
                      >
                        {!isAnswered ? "Unanswered" : item.isCorrect ? "Correct (+1)" : "Incorrect (0)"}
                      </span>
                    </div>

                    <p className="review-question-text">{item.question}</p>

                    <div className="review-options-summary">
                      <div className="review-option-line">
                        <strong>Your Answer:</strong>{" "}
                        {isAnswered ? (
                          <span>
                            {item.options && item.options[item.selectedOption]
                              ? item.options[item.selectedOption]
                              : `Option ${item.selectedOption + 1}`}
                          </span>
                        ) : (
                          <span className="text-muted">None selected</span>
                        )}
                      </div>

                      {item.correctOption !== undefined && item.correctOption !== null && (
                        <div className="review-option-line review-correct-line">
                          <strong>Correct Answer:</strong>{" "}
                          <span>
                            {item.options && item.options[item.correctOption]
                              ? item.options[item.correctOption]
                              : `Option ${item.correctOption + 1}`}
                          </span>
                        </div>
                      )}

                      {item.explanation && (
                        <p className="review-explanation">
                          <em>Explanation: {item.explanation}</em>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="results-actions">
          {!success && onRetrySubmit && (
            <button
              onClick={onRetrySubmit}
              disabled={isRetrying}
              className="btn btn-dark"
            >
              {isRetrying ? "Retrying Submission..." : "Retry Submission"}
            </button>
          )}

          <button onClick={onExitExam} className="btn btn-light-blue">
            Exit Exam & Return to Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExamResults;
