# IELTS Speaking AI

A full-stack web application designed to help IELTS candidates seamlessly practice and improve their speaking skills. The platform uses **OpenAI Whisper** for high-quality audio transcription and **Google Gemini AI** to automatically evaluate the response based on official IELTS band descriptors.

## 🚀 Features
- **Smart Practice Modes**: Supports IELTS Speaking Part 1, Part 2 (Cue Card), and Part 3.
- **AI-Generated Questions**: Automatically generates relevant, randomized topics using Gemini.
- **Browser Audio Recording**: Record your answers directly from your device's microphone, or upload existing audio files (`.mp3`, `.wav`, etc.).
- **Automatic Transcription & Evaluation**: 
  - Transcribes voice-to-text using local Whisper models.
  - Scores Fluency, Lexical Resource, Grammar, and provides constructive feedback/tips via Gemini AI.
- **Role-based Authentication**: Secure access for `Student`, `Teacher`, and `Admin` accounts.
- **Student Dashboard**: Visually rich dashboard tracking total submissions, average band score, and review statuses.
- **Teacher Review Portal**: Allows human teachers to adjust scores and provide personalized notes.

## 💻 Tech Stack
- **Frontend**: Vanilla HTML5, CSS3 (Modern custom variables, Flexbox/Grid), JavaScript (Fetch API, MediaRecorder API). No heavy frontend framework attached.
- **Backend**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3) for high-performance, asynchronous REST APIs.
- **Database**: MySQL, utilizing **SQLAlchemy** ORM for data management.
- **AI/ML**: 
  - `openai-whisper` (Local transcription model)
  - `google-generativeai` (Gemini 2.5 Flash for evaluation and text generation)
- **Security**: JWT (JSON Web Tokens) and bcrypt for password hashing (`passlib`).

---

## 🛠️ Installation & Setup

### 1. Requirements
Ensure you have the following installed:
- Python 3.9+
- MySQL Server (Ensure a database schema named `ieltsSpeaking` is created)
- FFmpeg (Required by Whisper for audio processing)

### 2. Backend Setup
Navigate to the `backend` directory and set up a virtual environment:
```bash
cd backend

# Create and activate virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Mac/Linux:
# source venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

#### Environment Variables
Create a `.env` file in the `backend/` directory with the following keys:
```env
# Database configuration
DATABASE_URL=mysql+mysqlconnector://<USER>:<PASSWORD>@localhost/ieltsSpeaking

# Authentication
SECRET_KEY=your_super_secret_jwt_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# AI Configuration
GEMINI_API_KEY=your_google_gemini_api_key
```

Run the backend server:
```bash
uvicorn main:app --reload
```
The API should now be running at `http://127.0.0.1:8000`. You can view the automatic Swagger UI documentation at `http://127.0.0.1:8000/docs`.

### 3. Frontend Setup
The frontend uses plain HTML, CSS, and JS, requiring only a simple static file server.
Open a new terminal window:
```bash
cd frontend

# Run a simple Python HTTP server
python -m http.server 5500
```
Open your browser and navigate to `http://localhost:5500/login.html` to start using the app.

---

## 📂 Project Structure
```text
Speaking Ielts/
├── backend/
│   ├── auth.py             # Authentication and JWT logic
│   ├── database.py         # DB connection setup
│   ├── main.py             # FastAPI entry point
│   ├── ml_models.py        # Loading Whisper and AI models configurations
│   ├── models.py           # SQLAlchemy Database Models
│   ├── submissions.py      # Core logic for handling audio, transcribing, evaluating
│   ├── db/                 # SQL dump / initiation files
│   └── uploads/            # Temporary storage for audio recordings
├── frontend/
│   ├── login.html          # Login layout
│   ├── dashboard.html      # Student dashboard layout
│   ├── submission.html     # Audio recording and submission interface
│   └── static/
│       ├── css/            # UI Styling components
│       └── js/             # Interactive logic (auth.js, submission.js, etc.)
└── README.md
```

## 📝 Usage Roles
1. **Student**: Can practice questions, view their personal dashboard, upload recordings, and receive immediate AI-generated feedback.
2. **Teacher**: Expected to see a queue of pending submissions and override/adjust AI evaluations.
3. **Admin**: Expected to manage user profiles and internal notes.
