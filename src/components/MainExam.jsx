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

function MainExam({ time, onEndTest }) {
  const [questionId, setQuestionId] = useState(1);
  const [question, setQuestion] = useState(sampleQuestions[0]);
  const [selectedOption, setSelectedOption] = useState(null);
  const totalQuestions = 5;

  async function getQuestion(id) {
    try {
      const response = await fetch(`http://localhost:3000/exam/mcq/${id}`);
      if (!response.ok) throw new Error("Backend not available");
      const data = await response.json();
      setQuestion(data);
    } catch {
      const found = sampleQuestions.find((q) => q.id === id) || sampleQuestions[0];
      setQuestion(found);
    }
  }

  useEffect(() => {
    let active = true;
    fetch(`http://localhost:3000/exam/mcq/1`)
      .then((res) => {
        if (!res.ok) throw new Error("Backend unavailable");
        return res.json();
      })
      .then((data) => {
        if (active) setQuestion(data);
      })
      .catch(() => {
        // Fallback is already loaded via initial state
      });

    return () => {
      active = false;
    };
  }, []);

  async function nextQuestion() {
    if (questionId === totalQuestions) return;
    const nextId = questionId + 1;
    setQuestionId(nextId);
    setSelectedOption(null);
    await getQuestion(nextId);
  }

  async function previousQuestion() {
    if (questionId === 1) return;
    const previousId = questionId - 1;
    setQuestionId(previousId);
    setSelectedOption(null);
    await getQuestion(previousId);
  }

  function handleEndTest() {
    if (onEndTest) {
      onEndTest();
    } else {
      window.location.reload();
    }
  }

  return (
    <div className="exam-page">
      <div className="exam-container">
        {/* Exam Header */}
        <div className="exam-header">
          <h3>Time Left: {time}</h3>
          <button className="end-test-btn" onClick={handleEndTest}>
            End Test
          </button>
        </div>

        {/* Question Card */}
        {question && (
          <div className="question-card">
            <h2>
              Question {questionId} of {totalQuestions}
            </h2>

            <p>{question.question}</p>

            {/* Options */}
            {question.options &&
              question.options.map((option, index) => (
                <label key={index} className="option-row">
                  <input
                    type="radio"
                    name="answer"
                    checked={selectedOption === index}
                    onChange={() => setSelectedOption(index)}
                  />
                  <span>{option}</span>
                </label>
              ))}

            {/* Navigation */}
            <div className="navigation-buttons">
              <button onClick={previousQuestion} disabled={questionId === 1}>
                Previous
              </button>

              <button
                onClick={nextQuestion}
                disabled={questionId === totalQuestions}
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
