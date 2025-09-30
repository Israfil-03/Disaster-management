# AadhyaPath - Disaster Management Web Application

**AadhyaPath** is a comprehensive disaster management web application designed to provide real-time information, facilitate communication, and coordinate relief efforts during emergencies. This platform connects users with critical resources, enables incident reporting, and empowers communities to build resilience.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🚀 About The Project

In times of crisis, timely and accurate information is crucial. AadhyaPath serves as a centralized hub for disaster response, bridging the gap between official agencies, volunteers, and the public. The application is designed to be intuitive, accessible, and reliable, even in low-connectivity situations.

**Live Demo:** https://israfil-03.github.io/AadhyaPath/

---

## ✨ Features

*   **Real-time Hazard Alerts:** View a dynamic feed of alerts, filterable by disaster type (e.g., flood, earthquake, fire) and severity.
*   **Interactive Resource Map:** Locate nearby shelters, hospitals, food distribution points, and other essential services.
*   **Incident Reporting:** Users can report incidents directly from their location, providing details and images to alert authorities.
*   **Volunteer Coordination:** A dedicated portal for volunteers to register, view available tasks, and receive assignments from administrators.
*   **Educational Content:** Access a library of "Do's and Don'ts" videos and articles for various emergency scenarios.
*   **Offline Functionality:** As a Progressive Web App (PWA), AadhyaPath can be installed on your device and works offline, ensuring access to critical information at all times.
*   **User Authentication:** Secure login and registration for users and administrators.

---

## 📖 How to Use the Web App

AadhyaPath is designed for three main types of users: General Users, Volunteers, and Administrators.

### 1. As a General User

1.  **Navigate to the Website:** Open the application in your web browser.
2.  **Create an Account or Log In:** Use the authentication page to sign up or log in.
3.  **View the Dashboard:** After logging in, you'll see the main dashboard with an overview of active alerts.
4.  **Explore Alerts:** Click on the "Alerts" tab to see a detailed list of hazards. Use the filters to narrow down the information.
5.  **Use the Map:** Go to the "Map" section to find nearby resources. You can filter by resource type (e.g., shelters, hospitals).
6.  **Report an Incident:** If you witness an emergency, use the "Report" feature to send details and your location to the authorities.
7.  **Learn Safety Measures:** Visit the "Resources" section to watch educational videos on disaster preparedness.

### 2. As a Volunteer

1.  **Register as a Volunteer:** In the "Volunteer Hub," fill out the registration form with your skills and availability.
2.  **Await Approval:** An administrator will review your application. Once approved, you will gain access to the volunteer dashboard.
3.  **View and Accept Tasks:** Browse the list of available tasks (e.g., debris cleanup, food distribution) and accept assignments that match your skills.
4.  **Track Your Contributions:** Your completed tasks will be logged in your profile.

### 3. As an Administrator

1.  **Log In with Admin Credentials:** Access the admin panel using your administrator account.
2.  **Manage Volunteers:** Review and approve volunteer applications.
3.  **Create and Assign Tasks:** Post new volunteer tasks with descriptions, locations, and required skills. Assign tasks to approved volunteers.
4.  **Broadcast Alerts:** Create and publish new hazard alerts to inform all users.

---

## 📸 Screenshots

| Dashboard | Alerts View |
| :---: | :---: |
| ![Dashboard](./Screenshot%202025-09-30%20101016.png) | ![Alerts View](./Screenshot%202025-09-30%20100852.png) |



## 🛠️ Tech Stack

*   **Frontend:** HTML5, CSS3, JavaScript (ES6+)
*   **Backend:** Node.js with Express.js
*   **Database & Authentication:** Supabase (PostgreSQL)
*   **Deployment:**
    *   **Frontend:** Deployed on services like GitHub Pages, Netlify, or Vercel.
    *   **Backend:** Hosted on Render, Heroku, or a similar platform.

---

## 🏁 Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

*   Node.js and npm installed on your machine.
*   A Supabase account for database and authentication services.

### Installation

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/Israfil-03/AadhyaPath.git
    ```
2.  **Navigate to the project directory:**
    ```sh
    cd AadhyaPath
    ```
3.  **Install frontend dependencies:**
    *(No frontend build step required for this vanilla JS project)*
4.  **Install backend dependencies:**
    ```sh
    cd server
    npm install
    ```
5.  **Configure Environment Variables:**
    *   Create a `.env` file in the `server` directory.
    *   Add your Supabase Project URL and Anon Key:
        ```
        SUPABASE_URL=your_supabase_project_url
        SUPABASE_KEY=your_supabase_anon_key
        ```
6.  **Run the backend server:**
    ```sh
    npm start
    ```
7.  **Open the `index.html` file** in your browser to view the application.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 📧 Contact

**Project Maintainer:** `Israfil Hoque` - `[israfilhoque523@gmail.com]`

**Project Link:** `[https://github.com/Israfil-03/AadhyaPath]`