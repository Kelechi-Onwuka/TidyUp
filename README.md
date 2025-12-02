# TidyUp — Automated Chore Rotation Web App

TidyUp is a lightweight household-management web application originally created to help my college roommates organize and rotate weekly chores without confusion.
The system is designed for shared living spaces of any kind; apartments, dorms, or full households.
Each household receives a secure auto-generated join code, allowing members to safely join the same chore group. All updates (chore completions, new assignments, reminders, and rotations) are instantly visible to every member, ensuring transparency and shared accountability.
TidyUp automatically rotates chores every Sunday at 11:59 PM and provides a clean interface for checking off tasks, viewing responsibilities, and managing weekly workflow.

---

## Features

- Weekly chore auto-rotation (every Sunday at 11:59 PM)
- Check-off system with visual status
- Household join code system using JSON storage
- Responsive UI with custom CSS
- Optional Python backend structure
- Frontend built with HTML, CSS, and JavaScript

---

## Tech Stack

**Frontend:** HTML, CSS, JavaScript  
**Backend (optional):** Python (FastAPI-ready structure)  
**Storage:** JSON  

---

## Project Structure

TidyUp/
├── index.html
├── style.css
├── app.js
├── .gitignore
│
├── backend/
│ ├── app.py
│ ├── requirements.txt
│ └── data/
│ └── households.json
│
└── src/
└── Main.java (optional Java files)


---

## 🚀 How to Run Locally
```bash
1. Clone the repository:
git clone https://github.com/Kelechi-Onwuka/TidyUp.git

2. Open in browser:
Just open:
index.html
The app runs fully in the browser (no server required).

Optional: Run the Python backend
cd backend
pip install -r requirements.txt
python app.py

Future Updates
Cleaner UI with softer glow + reduced brightness
Improved buttons and layout polish
Add chore categories
Add a hosted demo version
Add user authentication
Add recurring reminders logic
Add a database option

Author
Kelechi Onwuka

