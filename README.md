# JobVerse 🚀

**JobVerse** is an AI-powered hiring ecosystem that automates the recruitment lifecycle. From resume screening to technical interviews and real-time evaluation, JobVerse leverages the **Gemini AI API** to provide deep insights into candidate potential while ensuring integrity through WebSocket-based proctoring.

---

## 🔄 Project Flow: The Hiring Journey

The application follows a structured path for both recruiters and candidates:

### 1. Job Creation (HR)
- **Recruiter** posts a job with specific technical requirements, secondary skills, and experience levels.
- The **AI Engine** prepares to use these requirements as the benchmark for evaluation.

### 2. Application & AI Resume Screening (Student)
- **Candidate** uploads their resume and applies for a job.
- **Asynchronous Task (Celery):** The resume is parsed and compared against the job description using Gemini AI.
- **Result:** HR sees a "Resume Match Score" and a summary of strengths/weaknesses before even opening the file.

### 3. Interview Scheduling & Candidate Response (HR & Student)
- HR reviews screened candidates and clicks **Schedule AI Interview**.
- **Candidate Notification:** The candidate receives an automated email and sees a pulsing "Interview Invitation" panel on their Student Dashboard.
- **Confirmation:** The candidate can **Accept** or **Decline** the interview.
- **Join Link:** Upon acceptance, a live **Countdown Timer** appears on the dashboard. Exactly at the scheduled time, a **"Join AI Interview"** button unlocks in real-time. Their response is reflected on the HR Applications page.

### 4. The AI Interview Session (Student)
- **Real-time Interaction:** Upon acceptance and at the scheduled time, the candidate enters a dedicated interview interface. 
- **Automated Context:** The system automatically uses the resume submitted during the application phase to ground the interview.
- **Dynamic Questioning:** Instead of fixed questions, the AI generates technical challenges based on the job requirements and the candidate's specific profile.
- **Live Proctoring:** The system monitors for suspicious activity (tab switching, copy-pasting) via WebSockets.

### 5. Automated Evaluation & Reporting
- Each answer is evaluated by AI for technical accuracy and depth.
- Upon completion, a **Final Report** is generated containing:
    - Overall Technical Score
    - Detailed Strengths & Weaknesses
    - Hiring Recommendation (e.g., "Proceed to Final Round")
- HR receives an email notification with the summary.

---

## 🌟 Key Features

*   **Role-Based Access:** Specialized dashboards for HR Professionals and Students.
*   **Dynamic AI Interviews:** Context-aware questions that adapt to the candidate's profile.
*   **Interview Management:** Candidate flow for accepting/rejecting interview appointments with real-time HR status updates.
*   **WebSocket Proctoring:** Real-time anti-cheat monitoring with instant warnings.
*   **Asynchronous Processing:** Celery handles heavy AI computations without slowing down the UI.
*   **SMTP Integration:** Automated email notifications for scheduling, responses, and results.

---

## 🏗️ Architecture Stack

### Backend (Python/Django)
- **Framework:** Django REST Framework (DRF)
- **Real-time:** Django Channels (WebSockets)
- **Task Queue:** Celery + Redis
- **AI Integration:** Google GenAI SDK (Gemini 1.5 Flash)
- **Database:** PostgreSQL (Neon)

### Frontend (React)
- **Build Tool:** Vite
- **Styling:** Tailwind CSS + Lucide Icons
- **State/API:** Axios + Context API/Hooks

---

## 🚀 Getting Started Locally

### 1. Prerequisite Setup
- **Clone the Repo:** `git clone https://github.com/GautamSutar/JobVerse-AI.git`
- **Environment:** Create a `.env` in the root (see `.env.example`).

### 2. Backend Setup
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
pip install -r requirements.txt
pip install cloudinary
pip install django-cloudinary-storage
pip install Pillow
python manage.py migrate
# Use the venv Python to run the server
.\venv\Scripts\python manage.py runserver
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 4. Celery Worker (Required for AI Tasks)
```bash
cd backend
.\venv\Scripts\activate
celery -A core worker -l info --pool=solo
```

---

## 📖 Git Guidelines
- Local virtual environments (`venv/`) and environment files (`.env`) are ignored by Git.
- Root level `node_modules/` and frontend `node_modules/` are also ignored.
- Always use the root `.gitignore` provided.
