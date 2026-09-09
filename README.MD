# JobHazel

A full-stack job application tracker with a Chrome extension for saving job postings from any website.

JobHazel helps job seekers organize their search pipeline, save jobs from browser pages, track interviews, manage follow-up tasks, and analyze which job sources produce the best results.

The product is designed as a modern SaaS-style dashboard for candidates who apply across LinkedIn, Indeed, Greenhouse, Lever, Workday, company career pages, referrals, and recruiter outreach.

---

## Demo

**Live App:** https://jobhazel.com/

**Chrome Extension Demo:** Coming soon

---

## Features

### Job Application Tracking

* Create, edit, and delete job applications
* Track applications by status
* Store company, role, location, salary range, source, job URL, and notes
* Assign priority levels to applications
* Detect duplicate applications by URL, company, and role
* View all applications in a searchable table

### Kanban Tracker

* Drag applications between hiring stages
* Persist status updates in the database
* Track pipeline movement through an activity log
* View applications by stage:

  * Saved
  * Applied
  * Recruiter Screen
  * Technical Interview
  * Final Interview
  * Offer
  * Rejected
  * Withdrawn

### Chrome Extension Job Saving

* Save jobs from any browser page
* Capture page title, URL, source domain, and selected text
* Open an import review page inside the web app
* Parse selected job description text into structured fields
* Let users review and confirm imported data before saving

### Job Import System

* Paste a job URL
* Paste a job description
* Import from the Chrome extension
* Auto-detect job source from domain
* Extract possible job title, company, location, salary range, and skills
* Create an import draft before converting it into an application

### Interviews

* Add interviews to applications
* Track interview type, date, duration, meeting link, interviewer, notes, and outcome
* View upcoming interviews from the dashboard

### Tasks and Follow-Ups

* Add follow-up tasks, prep tasks, thank-you notes, and reminders
* Automatically create follow-up tasks when an application is marked as applied
* Automatically create thank-you tasks after interviews
* Mark tasks as complete
* View overdue and upcoming tasks

### Contacts

* Store recruiters, referrals, hiring managers, and employee contacts
* Associate contacts with companies or specific applications
* Save email addresses, LinkedIn URLs, roles, and notes

### Resume Management

* Upload and manage immutable, named PDF resume versions through the authenticated API
* Validate stored size and PDF signatures before making an upload available
* Rename, annotate, archive, and unarchive completed resumes
* Download resumes through five-minute links to private object storage

Planned UI and application integration work will:

* Associate the exact resume version submitted with an application
* Preserve application history when a newer resume version is uploaded
* Filter applications by resume version
* Measure interview and offer conversion by resume version

### Analytics

* Track total applications
* View applications submitted this week
* Measure response rate
* Measure interview conversion rate
* Measure offer rate
* Analyze applications by source
* Analyze application status distribution
* Track application volume over time
* Identify which sources produce the most interviews

---

## Tech Stack

### Web App

* **Framework:** Next.js
* **Language:** TypeScript
* **Styling:** Tailwind CSS
* **UI Components:** shadcn/ui
* **Database:** PostgreSQL
* **ORM:** Prisma
* **Authentication:** Auth.js
* **Charts:** Recharts
* **Drag and Drop:** dnd-kit
* **Deployment:** Vercel
* **Database Hosting:** Neon
* **Private File Storage:** Cloudflare R2

### Chrome Extension (planned)

* **Manifest:** Chrome Manifest V3
* **Language:** TypeScript
* **Permissions:** activeTab, scripting where needed
* **Purpose:** Capture user-selected job posting content and open the app import flow

---

## Product Architecture

JobHazel is split into two main parts:

1. **The web application**, which handles authentication, job tracking, data persistence, analytics, and import review.
2. **The Chrome extension**, which captures job posting context from the active browser tab and sends it to the web app.

The extension is intentionally lightweight. It does not store job data permanently, scrape private user accounts, or perform background monitoring. It acts as a user-triggered capture tool.

### High-Level Flow

```text
User visits job posting
        ↓
User highlights job description
        ↓
User clicks Chrome extension: “Save Job”
        ↓
Extension captures title, URL, source domain, and selected text
        ↓
Extension creates an import draft or opens the import page
        ↓
Web app parses job data
        ↓
User reviews and confirms details
        ↓
Application is saved to the user's pipeline
```

---

## Core Data Models

### User

Represents an authenticated user.

```text
User
- id
- name
- email
- createdAt
- updatedAt
```

### Application

The main entity in the product. Represents one job opportunity.

```text
Application
- id
- userId
- companyId
- title
- status
- source
- sourceUrl
- location
- workplaceType
- employmentType
- salaryMin
- salaryMax
- currency
- description
- priority
- dateSaved
- dateApplied
- resumeVersionId
- notes
- createdAt
- updatedAt
```

### Company

Stores company-level information.

```text
Company
- id
- userId
- name
- website
- industry
- size
- logoUrl
- notes
- createdAt
- updatedAt
```

### Contact

Stores recruiters, referrals, hiring managers, and other contacts.

```text
Contact
- id
- userId
- companyId
- applicationId
- name
- role
- email
- linkedinUrl
- relationship
- notes
- createdAt
- updatedAt
```

### Interview

Stores interview events connected to an application.

```text
Interview
- id
- userId
- applicationId
- type
- scheduledAt
- durationMinutes
- location
- meetingUrl
- interviewerName
- notes
- outcome
- createdAt
- updatedAt
```

### Task

Stores follow-up reminders and application-related action items.

```text
Task
- id
- userId
- applicationId
- title
- description
- dueDate
- completedAt
- type
- createdAt
- updatedAt
```

### ResumeVersion

Stores metadata for an immutable resume file in private object storage. Updating a
resume's display name or notes is allowed, but replacing its file creates a new
`ResumeVersion`. This ensures an application continues to reference the exact file
that was submitted.

```text
ResumeVersion
- id
- userId
- name
- targetRole
- storageKey
- originalFilename
- mimeType
- sizeBytes
- checksum
- uploadStatus
- extractedText
- notes
- archivedAt
- createdAt
- updatedAt
```

The database stores only metadata and the object-storage key. Resume bytes and
expiring download URLs are never stored in PostgreSQL.

### ImportDraft

Stores temporary imported job data before a user confirms and saves it.

```text
ImportDraft
- id
- userId
- sourceUrl
- sourceDomain
- pageTitle
- rawText
- parsedTitle
- parsedCompany
- parsedLocation
- parsedSalaryMin
- parsedSalaryMax
- parsedDescription
- confidence
- createdAt
- convertedAt
```

### ActivityLog

Stores user-visible history for application changes.

```text
ActivityLog
- id
- userId
- applicationId
- type
- message
- metadata
- createdAt
```

---

## Application Statuses

```text
Saved
Applied
Recruiter Screen
Technical Interview
Final Interview
Offer
Rejected
Withdrawn
```

These statuses are used by the Kanban pipeline, analytics, and status history.

---

## API Overview

### Applications

```http
GET    /api/applications
POST   /api/applications
GET    /api/applications/:id
PATCH  /api/applications/:id
DELETE /api/applications/:id
PATCH  /api/applications/:id/status
```

### Imports

```http
POST /api/imports/create-draft
GET  /api/imports/:id
POST /api/imports/:id/convert
POST /api/parser/job-description
```

### Tasks

```http
POST  /api/tasks
PATCH /api/tasks/:id
PATCH /api/tasks/:id/complete
DELETE /api/tasks/:id
```

### Interviews

```http
GET   /api/interviews
GET   /api/interviews?upcoming=true
GET   /api/interviews?applicationId=:applicationId
POST  /api/interviews
PATCH /api/interviews/:id
DELETE /api/interviews/:id
```

### Resumes

```http
GET   /api/resumes
POST  /api/resumes/uploads
POST  /api/resumes/:id/complete
GET   /api/resumes/:id/download-url
PATCH /api/resumes/:id
```

Resume routes require a bearer token. Uploads accept PDF metadata, return a
five-minute presigned `PUT` URL, and remain hidden until completion verifies the
stored content. `GET /api/resumes?includeArchived=true` includes archived, completed
resumes; the default list excludes archived and incomplete records.

### Analytics

```http
GET /api/analytics/summary
GET /api/analytics/sources
GET /api/analytics/timeline
GET /api/analytics/statuses
```

---

## Chrome Extension Design

The Chrome extension is built around a simple, user-triggered workflow.

### Extension Actions

* Read the active tab URL
* Read the active tab title
* Read selected text from the page
* Detect source domain
* Send captured data to the web app
* Open the import review page

### Minimal Permissions

```json
{
  "permissions": ["activeTab", "scripting"]
}
```

The extension should avoid broad host permissions where possible. `activeTab` keeps the extension scoped to the current page only after the user invokes it.

### Extension MVP Flow

```text
1. User opens a job posting page.
2. User highlights the job description.
3. User clicks the JobHazel extension icon.
4. Extension captures selected text, URL, title, and domain.
5. Extension opens the JobHazel import page.
6. User reviews the parsed job details.
7. User saves the job to their pipeline.
```

---

## Job Parsing Logic

JobHazel starts with deterministic parsing before adding AI.

### Source Detection

```text
linkedin.com        → LinkedIn
indeed.com          → Indeed
greenhouse.io       → Greenhouse
lever.co            → Lever
ashbyhq.com         → Ashby
workdayjobs.com     → Workday
other domain        → Company Website
```

### Salary Extraction Examples

Supported examples:

```text
$120,000 - $160,000
$80/hr
120k-150k
USD 100,000 - 140,000
```

### Skill Extraction

A predefined skill dictionary can identify common technologies in job descriptions:

```text
JavaScript
TypeScript
React
Next.js
Node.js
Python
Java
Go
PostgreSQL
AWS
Docker
Kubernetes
GraphQL
REST
Redis
MongoDB
Prisma
Tailwind CSS
CI/CD
```

### Duplicate Detection

JobHazel warns users when a new application appears to match an existing one.

Duplicate signals:

* Same source URL
* Same company and title
* Same company and similar role name
* Same imported page title

---

## Analytics Definitions

### Response Rate

```text
Applications beyond Applied / Total applied applications
```

### Interview Rate

```text
Applications with at least one interview / Total applied applications
```

### Offer Rate

```text
Offers / Total applied applications
```

### Source Quality

```text
Interviews or offers generated per application source
```

---

## Local Development

### Prerequisites

* Node.js 18+
* PostgreSQL
* npm, pnpm, or yarn
* Chrome browser for extension testing

### 1. Clone the repository

```bash
git clone https://github.com/your-username/JobHazel.git
cd JobHazel
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file:

```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55489/JobHazel"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
AUTH_SECRET=""
AUTH_GITHUB_ID=""
AUTH_GITHUB_SECRET=""
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
```

### 4. Run database migrations

```bash
npx prisma migrate dev
```

### 5. Seed demo data

```bash
npx prisma db seed
```

### 6. Start the development server

```bash
npm run dev
```

The app should now be available at:

```text
http://localhost:4000
```

## Chrome Extension Local Setup

From the extension directory:

```bash
cd extension
npm install
npm run build
```

Then load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click “Load unpacked”
4. Select the extension build folder
5. Open a job posting page
6. Highlight the job description
7. Click the JobHazel extension icon

---

## Security and Privacy

JobHazel is designed around user-controlled data capture.

Security principles:

* Every application record is scoped to the authenticated user
* Users cannot access other users’ applications
* Resume files are stored in private object storage and accessed only through
  short-lived, user-scoped URLs
* The Chrome extension only captures data after user action
* The extension does not monitor browser activity in the background
* The extension does not collect LinkedIn or Indeed credentials
* The app does not auto-apply to jobs
* Imported job data must be reviewed before saving
* Backend inputs are validated before database writes

---

## Testing Plan

### Unit Tests

* Source detection
* Salary parsing
* Location parsing
* Skill extraction
* Title parsing
* Duplicate detection
* Analytics calculations

### Integration Tests

* Create application
* Update application status
* Create import draft
* Convert import draft to application
* Create follow-up task after application is marked applied
* Add interview to an application
* Ensure user-scoped data access
* Initiate and complete a valid resume upload
* Reject unsupported, oversized, missing, or malformed resume uploads
* Prevent one user from listing, downloading, updating, deleting, or associating
  another user's resume
* Associate, change, and remove an application's resume and verify activity history
* Refuse permanent deletion of a resume referenced by an application
* Remove the object and metadata for an unreferenced permanent deletion
* Clean up abandoned uploads

### Manual Extension Tests

* Save from LinkedIn job page
* Save from Indeed job page
* Save from Greenhouse job page
* Save from Lever job page
* Save from Workday job page
* Save from company career page
* Save with selected text
* Save without selected text
* Save while logged out
* Detect duplicate application

---

## Known Limitations

* Self-service account creation is limited to 1,000 current accounts. When the
  limit is reached, `POST /auth/signup` returns `409 Conflict`. Deleting an
  account makes a registration slot available again.
* JobHazel does not directly sync LinkedIn or Indeed application history.
* The Chrome extension does not scrape private job-board account pages.
* Job parsing is heuristic-based and may require user correction.
* Some job boards render content dynamically, so selected text may be more reliable than automatic page extraction.
* The app does not submit applications on behalf of users.
* Gmail and Google Calendar integrations are not included in the initial MVP.
* Resume parsing, job matching, and automatic tailoring are not included in the
  resume-upload MVP.

---

## Future Improvements

* Gmail import for application confirmation emails
* Google Calendar interview detection
* CSV import and export
* AI-powered job description parsing
* AI-generated interview prep checklist
* Resume text extraction and job-to-resume matching
* Resume tailoring workflow
* Browser extension authenticated one-click save
* Public job search activity reports
* Custom pipeline stages
* Email reminders for follow-ups
* Mobile-friendly PWA experience

---

## License

This project is available under the MIT License.

---

## Author

Built by Antonio Indindoli.

## Backend Auth Dev Setup

1. Copy `backend/.env.example` to `backend/.env` and set secure JWT secrets.
2. Install backend deps: `cd backend && npm install`.
3. Generate Prisma client: `npm run prisma:generate`.
4. Run migrations: `npx prisma migrate dev`.
5. Seed dev auth user (optional): `npm run db:seed`.
6. Start API: `npm run dev`.

### Useful Backend Scripts

- `npm test` – runs auth validation and error middleware tests.
- `npm run db:seed` – upserts a demo user for local auth testing.
- `npm run db:dev:reset` – resets DB and reseeds dev data.
