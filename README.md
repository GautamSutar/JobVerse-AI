# JobVerse 🚀

**JobVerse** is a full-stack, AI-powered hiring ecosystem that automates the complete recruitment lifecycle — from intelligent resume screening and automated aptitude assessments to context-aware AI interviews and real-time proctoring. Built with **Django REST Framework**, **React + Vite**, and powered by the **Google Gemini AI API**.

---

## 🌟 Features Overview

| Feature | Description |
|---|---|
| 🎯 AI Resume Screening | Gemini AI scores & summarizes every resume against job requirements |
| 🧠 AI Interviews | Dynamic, context-aware technical interviews per candidate profile |
| 📝 Aptitude Tests | 80-question Full Readiness Test with fullscreen proctoring & anti-cheat |
| 🎙️ Practice Interviews | AI-driven mock interviews for student preparation |
| 📋 HR Job Management | Post, edit, delete jobs and manage all applicants |
| 📊 Analytics Dashboards | Score trends, domain breakdowns, and hiring insights |
| 💬 Community Chat | Real-time peer chat with WebRTC Video & Voice calls for DMs |
| 🎓 Alumni Connect | Mentorship, job referrals, and direct student requests via Alumni Dashboard |
| 🕹️ Multiplayer Game | Real-time matchmaking Tic-Tac-Toe via WebSocket for community engagement |
| 🔒 Advanced AI Proctoring | Webcam object detection (Phones/Multiple Faces), Audio Noise & Hardware tampering logs |
| 🛡️ Anti-Cheat Mechanisms | Tab-switches, Fullscreen-exits, Copy-Paste blocks, and Screenshot warnings |
| 📧 Email Automation | SMTP notifications for scheduling, acceptance, and results |
| 🏋️ Workshops | Student workshop discovery and enrollment |
| ☁️ Cloud Media Storage | Resume and media files stored via Cloudinary |

---

## 🔄 Complete Application Flow

### 👤 Student Flow

```
Register/Login → Student Dashboard
   │
   ├── 📄 Resume Builder
   │      Upload or build resume → stored for all job applications
   │
   ├── 🔍 Job Marketplace
   │      Browse active job postings → Apply (attaches resume auto)
   │      └── Gemini AI scores resume vs job requirements (async, Celery)
   │
   ├── 📅 Interview Invitation
   │      HR schedules AI Interview → Student gets email notification
   │      Student Dashboard shows pulsing invitation panel
   │      Student Accepts or Rejects → HR notified via email
   │      Countdown timer shows until scheduled time
   │      At scheduled time → "Join AI Interview" button unlocks
   │
   ├── 🤖 AI Interview Session
   │      Full-screen interview UI
   │      AI generates questions from resume + job requirements (Gemini)
   │      Student answers in real time → each answer AI-evaluated
   │      On completion → Final Report (score, strengths, weaknesses, recommendation)
   │      HR notified via email
   │
   ├── 📝 Aptitude Practice
   │      Select category (APTITUDE, LOGICAL, COMMUNICATION, DOMAIN)
   │      or take 80-question Full Readiness Test (40 min)
   │      Fullscreen AI proctored — continuous webcam & mic monitoring
   │      Auto-submits instantly on Severe violations (Phones, >1 Person, Mic/Cam unplugged)
   │      Auto-submits on 3 total Suspicious actions (Tab switch, fullscreen exit, shortcuts)
   │      Results: score, domain breakdown, and detailed JSON Proctoring Intervention Logs
   │
   ├── 🎙️ Practice Interview
   │      AI mock interview on any topic
   │      Async Gemini evaluation after each answer
   │
   ├── 💬 Community Chat & Connect
   │      Real-time peer discussion with other students
   │      Direct Messages with Alumni and Peers
   │      Seamless WebRTC Voice & Video calling built-in
   │      Mute / Camera toggle controls during calls
   │
   ├── 🕹️ Multiplayer Game
   │      Real-time online Tic-Tac-Toe against other students
   │      WebSocket-based matchmaking queue
   │
   └── 🏋️ Workshops
          Browse & join skill workshops
```

### 🏢 HR Flow

```
Register/Login (role: HR) → HR Dashboard
   │
   ├── 📋 Post Job
   │      Title, company, requirements, skills, experience level, deadline
   │
   ├── 🗂️ View Jobs (My Jobs)
   │      See all self-posted jobs → Edit / Delete
   │      "View Applications" button per job
   │
   ├── 👥 Applications
   │      See all candidates who applied for a specific job
   │      AI Resume Match Score & Summary (from async screening)
   │      Download candidate resume as PDF
   │      Schedule AI Interview → candidate gets email invite
   │      Track candidate response (Accepted/Rejected/Pending)
   │      View completed interview report (score, strengths, weaknesses)
   │
   └── 📊 Analytics
          Hiring pipeline stats, score distributions, domain performance
```

### 🎓 Alumni Flow

```
Register/Login (role: Alumni) → Alumni Dashboard
   │
   ├── 👤 Profile Management
   │      Update bio, company, role, and professional details
   │
   ├── 📬 Student Requests
   │      Review mentorship / referral requests from students
   │      Accept or decline with a response message
   │
   ├── 💼 Job Referrals
   │      Post and manage job referral opportunities for students
   │
   ├── 💬 Community Chat & Direct Messages
   │      Engage in community channels
   │      One-on-one DMs with students; WebRTC Video & Voice calls
   │
   └── 🔔 Notifications & Settings
          Manage preferences and notification alerts
```

---

## 🏗️ Architecture

### Backend — Django + DRF

```
backend/
├── core/                  # Django settings, URL root, ASGI/WSGI
├── apps/
│   ├── users/             # Custom user model (Student / Alumni / HR roles), JWT auth
│   ├── jobs/              # Job postings, Applications, Resume AI screening
│   ├── resumes/           # Resume storage, PDF parsing, AI summary generation
│   ├── interviews/        # AI Interviews, Practice Interviews, Aptitude Tests
│   ├── proctoring/        # Violation logs (webcam, audio, tab-switch, etc.)
│   ├── community/         # Real-time chat, DMs, WebRTC signaling, matchmaking game
│   └── workshops/         # Workshop model and enrollment
├── services/
│   └── ai_service.py      # All Gemini API calls (questions, evaluation, reports)
└── requirements.txt
```

| Layer | Technology |
|---|---|
| Framework | Django 5 + Django REST Framework |
| Auth | JWT (Simple JWT) |
| AI Engine | Google Gemini 1.5 Flash (via `google-generativeai`) |
| WebSockets | Django Channels + Daphne (ASGI) |
| Task Queue | Celery + Redis |
| Database | PostgreSQL (Neon / local) |
| Media Storage | Cloudinary |
| Email | SMTP (Gmail) |

### Frontend — React + Vite

```
frontend/src/
├── pages/
│   ├── Login.jsx / Register.jsx
│   ├── StudentDashboard.jsx        # Main layout for students
│   ├── HRDashboard.jsx             # Main layout for HR
│   ├── InterviewSession.jsx        # Live AI interview UI
│   ├── InterviewWarning.jsx        # Pre-interview rules screen
│   ├── JobListing.jsx              # Public job listing
│   ├── hr/
│   │   ├── Dashboard.jsx           # HR overview
│   │   ├── PostJob.jsx             # Job creation form
│   │   ├── MyJobs.jsx              # HR's job listings
│   │   ├── Applications.jsx        # Candidate management
│   │   ├── Analytics.jsx           # HR analytics charts
│   │   └── Profile.jsx
│   ├── student/
│   │   ├── Dashboard.jsx           # Student overview + interview invite
│   │   ├── JobMarketplace.jsx      # Job search and apply
│   │   ├── AptitudePractice.jsx    # Proctored aptitude test (TensorFlow AI)
│   │   ├── PracticeInterview.jsx   # AI mock interview
│   │   ├── Resumes.jsx             # Resume builder & upload
│   │   ├── CommunityChat.jsx       # Peer chat + WebRTC Video/Voice calls
│   │   ├── Workshops.jsx
│   │   ├── Analytics.jsx
│   │   ├── Applications.jsx        # Student's own applications
│   │   └── Profile.jsx
│   └── alumni/
│       ├── Dashboard.jsx           # Alumni overview
│       ├── Profile.jsx             # Alumni profile management
│       ├── StudentRequests.jsx     # Mentorship / referral requests
│       ├── JobReferrals.jsx        # Post and manage job referrals
│       ├── Messages.jsx            # Direct messages + video calls
│       ├── Notifications.jsx       # Notification feed
│       └── Settings.jsx
├── services/
│   └── api.js                      # Axios instance with JWT interceptors
└── App.jsx                         # Route definitions
```

| Layer | Technology |
|---|---|
| Build Tool | Vite 5 |
| UI Framework | React 18 + React Router DOM 6 |
| Styling | Tailwind CSS + Lucide Icons |
| Charts | Recharts |
| API Client | Axios |
| Notifications | React Hot Toast |
| AI Proctoring | TensorFlow.js + COCO-SSD object detection |
| Webcam | react-webcam |

---

## 🚀 Getting Started Locally

### Prerequisites
- Python 3.10+
- Node.js 18+
- Redis (for Celery + Django Channels)
- PostgreSQL (or SQLite for quick dev)

---

### 🚀 Quick Start (Starting Servers)
If you have already installed the dependencies, you can start both servers by opening two separate terminals from the root directory:

**Terminal 1 (Backend):**
```bash
cd backend
.\venv\Scripts\activate        # Windows
# source venv/bin/activate     # Mac/Linux
python manage.py runserver
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/GautamSutar/JobVerse-AI.git
cd JobVerse-AI
```

---

### Step 2 — Environment Variables

Create a `.env` file inside `backend/` with the following:

```env
SECRET_KEY=your_django_secret_key
DEBUG=True

# Database (use SQLite for quick local dev, or Neon PostgreSQL)
DATABASE_URL=sqlite:///db.sqlite3

# Google Gemini AI
GEMINI_API_KEY=your_google_gemini_api_key

# Email (SMTP via Gmail)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your_email@gmail.com
EMAIL_HOST_PASSWORD=your_gmail_app_password
DEFAULT_FROM_EMAIL=your_email@gmail.com

# Redis (for Celery + Channels)
CELERY_BROKER_URL=redis://localhost:6379/0
CHANNEL_LAYERS_REDIS=redis://localhost:6379/1

# Cloudinary (Media Storage)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

---

### Step 3 — Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\activate        # Windows
# source venv/bin/activate     # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Apply database migrations
python manage.py migrate

# (Optional) Load sample aptitude questions
python manage.py loaddata fixtures/aptitude_questions.json

# Start the Django/Daphne ASGI server
python manage.py runserver
```

Backend runs at: **http://localhost:8000**

---

### Step 4 — Frontend Setup

```bash
cd frontend

# Install Node dependencies
npm install

# Start Vite dev server
npm run dev
```

Frontend runs at: **http://localhost:5173**

---

### Step 5 — Celery Worker (Required for AI Tasks)

AI resume screening, interview question generation, and answer evaluation all run asynchronously via Celery. Start the worker in a separate terminal:

```bash
cd backend
.\venv\Scripts\activate
celery -A core worker -l info --pool=solo   # Windows
# celery -A core worker -l info             # Mac/Linux
```

> **Note:** Redis must be running before starting Celery and Django Channels. Install Redis locally or use a cloud Redis instance.

---

## 🔑 User Roles

| Role | Access |
|---|---|
| **Student** | Job marketplace, resume builder, aptitude tests, practice interviews, AI interviews, community chat, video/voice calls, multiplayer game, workshops |
| **Alumni** | Alumni dashboard, review student requests, provide job referrals, connect via community chat and video calls |
| **HR** | Post/edit/delete jobs, view & manage applications, schedule AI interviews, view results and analytics |

Register with any email — select your role (Student / Alumni / HR) during registration.

---

## 📝 Advanced AI Proctoring & Anti-Cheat

The Full Readiness Test and category-specific tests operate under a strict, automated AI proctoring environment:

### AI Detection Engine (TensorFlow.js `coco-ssd`)
- **Object Detection:** Continuously scans the webcam feed. If a **Cell Phone** or **Multiple Persons** are detected, the test triggers a 'Severe' violation and auto-submits.
- **Face Tracking:** Triggers a warning if the candidate's face drops out of frame for 10 seconds. Accumulating 5 "No Face" strikes auto-submits the test.

### Audio & Hardware Monitoring
- **Noise Detection:** Analyzes FFT frequencies via `AudioContext`. If loud background noise or alternative voices are sustained for 4 seconds, it triggers a 'Severe' violation and auto-submits.
- **Hardware Disconnects:** Actively listens to `MediaStream` tracks. If a user unplugs or software-disables their microphone/camera mid-test, it auto-submits.

### Suspicious Action "Strike" System
- **Fullscreen Enforced:** Test starts in mandatory fullscreen. Exiting is a strike.
- **Tab Switching & Visibility:** Navigating away from the window is a strike.
- **Shortcut & Clipboard Blocking:** Right-clicks, Dragging, Snipping Tool (`Win+Shift+S`), and MacOS screenshots are suppressed or logged as strikes. Copying/Pasting text is disabled and counts as a strike.
- **3-Strike Limit:** All minor Suspicious Actions share a unified pool. Hitting 3 strikes auto-submits the test.

### Comprehensive Logging Dashboard
- End-of-test Result Dashboards dynamically render a comprehensive JSON log of every intervention.
- Includes exact infraction Timestamps, Warning/Severe severity tags, and descriptive reasons for each flag instead of simple numeric counts.

---

## 📁 Project Structure (Top Level)

```
JobVerse-AI/
├── backend/          # Django + DRF + Channels API server
├── frontend/         # React + Vite web app
├── docker-compose.yml
├── .env              # Root-level env (if using Docker)
├── .gitignore
└── README.md
```

---

## 🐳 Docker (Optional)

A `docker-compose.yml` is included for containerized setup:

```bash
docker-compose up --build
```

---

## 📖 Git & Development Notes

- `venv/`, `.env`, and `node_modules/` are all git-ignored — see `.gitignore`.
- Always activate your Python virtual environment before running backend commands.
- The Celery worker **must** be running for any AI feature to work (resume screening, interview generation, aptitude evaluation).
- Django Channels / Daphne handles all WebSocket connections (community chat, video call signaling, game matchmaking).
- Media files (uploaded resumes) are stored via Cloudinary.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'feat: add your feature'`)
4. Push to branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

*Built with ❤️ by the JobVerse Team*
