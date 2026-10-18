# CampusFix — Campus Complaint Management System

CampusFix is a responsive full-stack web application for reporting and tracking campus maintenance issues.

🌐 **Live Demo:** [Click here to view CampusFix](https://hariraavi-code.github.io/CampusFix/)

## Features

- Submit complaints with a category, location, description and priority
- View and search complaints
- Filter by status
- Change complaint status: Open, In Progress or Resolved
- Delete complaints
- Dashboard statistics that remain accurate while searching/filtering
- Server-side validation for required fields, categories and field lengths
- Express REST API
- Persistent JSON-file storage
- Responsive layout for desktop and mobile

## Tech stack

- HTML, CSS, JavaScript
- Node.js and Express
- JSON file storage using Node.js built-in `fs` module

## Run locally

1. Install Node.js LTS from https://nodejs.org/en/download
2. Open this project folder in VS Code.
3. Open Terminal → New Terminal.
4. Run:

   ```bash
   npm install
   npm run dev
   ```

5. Visit http://localhost:3000

If you do not want auto-restart, use `npm start` instead.

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Check server |
| GET | `/api/complaints` | List complaints; supports `search` and `status` query parameters |
| GET | `/api/complaints/stats` | Get overall dashboard statistics, independent of table filters |
| POST | `/api/complaints` | Create a complaint |
| PATCH | `/api/complaints/:id/status` | Update complaint status |
| DELETE | `/api/complaints/:id` | Delete a complaint |

## Important limitations

This is a portfolio MVP. It does not yet include real user authentication or enforce student/admin roles. Status changes and deletion are available to anyone who can access the app. Do not use it for real sensitive complaints until authentication, authorization, security controls and a production database are added.

## Suggested next improvements

- Add authentication and role-based permissions
- Replace JSON storage with SQLite or PostgreSQL
- Add tests and API validation
- Deploy the backend and configure persistent storage
