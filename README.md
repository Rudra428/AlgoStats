# AlgoStats⚔️

AlgoStats-Arena is a full-stack algorithmic intelligence engine designed to break down data silos between competitive programming and interview preparation platforms. By syncing real-time data from **Codeforces** and **LeetCode**, it synthesizes fragmented metrics into a single, comprehensive dashboard and provides an immersive environment for structured, adaptive training.

## 🚀 Live Environment
* **Frontend (Production):** [https://algo-stats-zeta.vercel.app](https://algo-stats-zeta.vercel.app)
* **Backend API (Production):** [https://algostats.onrender.com](https://algostats.onrender.com)

---



## 🎯 Problem & Solution

### The Problem 📉
With thousands of algorithmic problems spread across fragmented platforms like Codeforces and LeetCode, developers face intense **decision fatigue**. It is incredibly difficult for a user to self-diagnose their exact skill gaps, leading them to either waste time solving trivial problems below their tier or get frustrated by hitting roadblocks on problems far beyond their current capabilities.

### Our Solution: The Arena Engine 🚀
AlgoStats-Arena eliminates decision fatigue by operating as an automated algorithmic coach. 

Instead of forcing users to choose, the platform utilizes a custom synthesis algorithm that reads live profile data, parses cross-platform historical performance, and maps out user capabilities. It then dynamically curates an optimized batch of unsolved problems and packages them into a time-bounded **Custom Contest**. This guarantees that every training session targets the exact sweet spot of the user's current engineering threshold, accelerating skill acquisition through structured, adaptive learning.

---

## ✨ Core Features & Uniqueness

Unlike standard profile aggregators, AlgoStats-Arena acts as an **engineering intelligence layer** that actively drives developer growth:

* **The Unified "Power Score" Synthesis:** Calculates a weighted "Developer Fitness Score" by synthesizing Codeforces rating volatility, LeetCode problem volume (Easy/Medium/Hard split), and active consistency metrics.
* **Cross-Platform Custom Arenas:** Analyzes your active profile ratings to dynamically curate targeted problem sets that bridge identified skill gaps across both ecosystems.
* **Integrated Heatmap Aggregation:** Combines submission cadences from multiple distinct platforms into a singular, unified activity grid, gamifying cross-platform problem-solving volume.
* **Smart "Swap Route" Mechanics:** Acts as an automated tutor during contest generation. If a problem isn't a good fit, the intelligent swapping service replaces it with an algorithmic match strictly matching the target difficulty tier.
* **Centralized Identity Mapping:** A secure account mapping layer connecting Google OAuth, Codeforces handles, and LeetCode credentials into a unified, recruiter-ready profile.

---

## 🛠️ Tech Stack & Architecture

* **Frontend:** React.js (Vite), Tailwind CSS, Axios, Google OAuth
* **Backend:** Python, Flask, Gunicorn
* **Database:** PostgreSQL (Relational schema modeling custom contests & multi-identity mapping)
* **API Ingestion:** GraphQL (LeetCode Data Services), REST (Codeforces Telemetry)
* **Deployment:** Vercel (Frontend), Render (Backend & DB)

---

## 💻 Local Setup Instructions

### Prerequisites
* Python 3.10+
* Node.js v18+
* PostgreSQL instance running locally

### 1. Backend Setup
1. Clone the repository and navigate to the backend folder:
   ```bash
   git clone [https://github.com/Rudra428/AlgoStats.git](https://github.com/Rudra428/AlgoStats.git)
   cd AlgoStats/backend
