# RaniWebSolution Project Overview

## What This Project Is
A service-based business website with:
- Lead capture forms
- Online payments (Razorpay + PayPal test integrations)
- Admin dashboard for leads and payments
- Email notifications to Gmail

## Tech Stack
- Frontend: HTML, CSS, Vanilla JS
- Backend: Node.js + Express
- Database: NeDB (file-based database stored in `data/`)
- Payments: Razorpay Checkout + PayPal Orders API
- Email: Nodemailer (Gmail SMTP)
- Admin Dashboard: Protected static UI + secure admin APIs

## File Structure
```
.
|-- admin/
|   |-- index.html
|   |-- admin.css
|   `-- admin.js
|-- public/
|   |-- index.html
|   |-- styles.css
|   |-- app.js
|   `-- assets/
|       |-- history.svg
|       |-- gallery-1.svg
|       |-- gallery-2.svg
|       |-- gallery-3.svg
|       `-- video-thumb.svg
|-- data/              (auto-created at runtime, ignored by git)
|-- server.js
|-- package.json
|-- .env.example
`-- PROJECT_OVERVIEW.md
```

## How This Helps the Business
- Captures real leads and stores them in a database for follow-up.
- Tracks payments with status (pending, success, failed) for accounting.
- Sends emails to Gmail so the team gets instant notifications.
- Gives the admin dashboard a clear view of performance and revenue.
- Builds trust with professional sections: mission, history, media, and map.

## Setup
1. Copy `.env.example` to `.env` and fill Razorpay + PayPal + Gmail + admin credentials.
2. Run `npm install`
3. Start the server: `npm run dev`
4. Open the website: `http://localhost:3000`
5. Admin dashboard: `http://localhost:3000/admin` (protected with Basic Auth)
