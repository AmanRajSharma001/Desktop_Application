import { useEffect, useState } from "react";

const sampleQuestions = [
  {
    id: 1,
    question: "Which Electron process is responsible for creating BrowserWindow?",
    options: ["Renderer Process", "Main Process", "React Process", "Preload Process"],
  },
  {
    id: 2,
    question: "Which Electron API is commonly used in the renderer to invoke a handler in the main process?",
    options: ["ipcRenderer.invoke", "BrowserWindow.loadURL", "fs.writeFileSync", "dialog.showMessageBox"],
  },
  {
    id: 3,
    question: "Why is a preload script commonly used in Electron?",
    options: ["To style the React application", "To expose controlled APIs safely to the renderer", "To create the Express server", "To replace the main process"],
  },
  {
    id: 4,
    question: "Which HTTP method is normally used to fetch exam questions?",
    options: ["GET", "DELETE", "PATCH", "CONNECT"],
  },
  {
    id: 5,
    question: "What does fs.writeFileSync() do?",
    options: ["Reads camera frames", "Writes data to a file synchronously", "Starts the Electron renderer", "Sends an IPC event"],
  },
];

function MainExam({ time, onEndTest, isBlocked = false }) {
  const [questions, setQuestions] = useState(sampleQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});

  const totalQuestions = questions.length;
  const currentQuestion = questions[currentIndex] || sampleQuestions[0];
  const questionId = currentQuestion ? currentQuestion.id : 1;
  const selectedOption = answers[questionId] !== undefined ? answers[questionId] : null;

  useEffect(() => {
    let active = true;
    // Attempt to load full question set if backend service is running
    fetch("http://localhost:3000/exam/mcq/all")
      .then((res) => {
        if (!res.ok) throw new Error("Backend not available");
        return res.json();
      })
      .then((data) => {
        if (active && Array.isArray(data) && data.length > 0) {
          setQuestions(data);
        }
      })
      .catch(() => {
        // Fallback remains the initial sampleQuestions
      });

    return () => {
      active = false;
    };
  }, []);

  function handleOptionSelect(index) {
    if (isBlocked) return;
    setAnswers((prev) => ({
      ...prev,
      [questionId]: index,
    }));
  }

  function nextQuestion() {
    if (isBlocked) return;
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }

  function previousQuestion() {
    if (isBlocked) return;
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }

  function handleEndTest() {
    if (isBlocked) return;
    if (onEndTest) {
      onEndTest();
    } else {
      window.location.reload();
    }
  }

  return (
    <div className={`exam-page ${isBlocked ? "exam-page-blocked" : ""}`}>
      <div className="exam-container">
        {/* Exam Header */}
        <div className="exam-header">
          <h3>Time Left: {time}</h3>
          <button
            className="end-test-btn"
            onClick={handleEndTest}
            disabled={isBlocked}
          >
            End Test
          </button>
        </div>

        {/* Question Card */}
        {currentQuestion && (
          <div className="question-card">
            <h2>
              Question {currentIndex + 1} of {totalQuestions}
            </h2>

            <p>{currentQuestion.question}</p>

            {/* Options */}
            {currentQuestion.options &&
              currentQuestion.options.map((option, index) => (
                <label
                  key={index}
                  className={`option-row ${isBlocked ? "option-disabled" : ""}`}
                >
                  <input
                    type="radio"
                    name={`question-${questionId}`}
                    checked={selectedOption === index}
                    onChange={() => handleOptionSelect(index)}
                    disabled={isBlocked}
                  />
                  <span>{option}</span>
                </label>
              ))}

            {/* Navigation */}
            <div className="navigation-buttons">
              <button
                onClick={previousQuestion}
                disabled={currentIndex === 0 || isBlocked}
              >
                Previous
              </button>

              <button
                onClick={nextQuestion}
                disabled={currentIndex === totalQuestions - 1 || isBlocked}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MainExam;
