# JVTutorCorner RWD Project Architecture (Xmind Compatible)

This file is structured specifically for **Xmind Import**. 
To use this in Xmind:
1. Copy the content below.
2. Open Xmind.
3. Use **File > Import > Markdown** (or paste directly onto the canvas, or use "Outliner" view and paste).

# JVTutorCorner RWD Project
## 1. Functional View (User Features)
- Onboarding & Personalization
    - Visitor Idle Survey (lite)
    - Registered User Questionnaire (full)
    - MMR-based Personal Recommendation
- Student Portal
    - Login & Auth (Cognito + Bypass Secret)
    - Course Enrollment (Point-based/Direct)
    - Learning History (CourseRecord)
    - Feedback & Testimonials
- AI Assistant
    - Float Widget & Dedicated Chat Page
    - 3-Agent Logic (Ask-Plan-Execute)
    - Tool Calling (Platform Skills)
- Teacher Portal
    - Course Management (Dashboard)
    - Profile Change Application
    - Session Scheduling (Appointments)
- Live Classroom
    - Real-time Video (Agora RTC)
    - Real-time Messaging (Agora RTM)
    - Interactive Whiteboard (Konva)
    - PDF Sync & Classroom Tools
- Admin Dashboard
    - Order Management & CSV Export
    - Teacher Qualification & Profile Review
    - Subscription & Plan Configuration

## 2. Logical View (Architecture)
- Frontend (Next.js 16)
    - App Router Architecture
    - Server Actions & Components
    - SSE / BroadcastChannel Sync
- AI Ecosystem
    - Gemini 1.5 Pro / GPT-4o Integration
    - Agentic Workflow Engine
- Backend (AWS Amplify)
    - AppSync (GraphQL API)
    - Cognito (Auth Provider)
    - Lambda (Background Tasks)
    - S3 (Asset Storage)
- Data Layer (DynamoDB)
    - Relational Mapping (GraphQL @model)
    - Search & Indexing (@index)

## 3. Data View (Key Models)
- Core Entities
    - Student / Teacher / Admin
    - Course / Enrollment
- AI & Personalization
    - UserInteractions (Recommendation)
    - AppIntegrations (AI Config)
- Transactional
    - Order / Payment / Refund
    - PlanUpgrade (Subscriptions)
- Interactional
    - Appointment / CourseRecord
    - TeacherReview (Pending Changes)

## 4. Tech Stack (Dependencies)
- UI/UX
    - Tailwind CSS 4
    - AWS Amplify UI
    - Visual: Konva / XYFlow
- AI / Database
    - Google Generative AI (Gemini)
    - OpenAI Node.js SDK
- Communication
    - Agora RTC/RTM/Whiteboard
- Utilities
    - date-fns / uuid / jspdf

## 5. Deployment & DevOps
- CI/CD
    - GitHub Actions (Build/Test)
    - Amplify Hosting
- Quality Assurance
    - Playwright (E2E Tests)
    - Auto-Login (Bypass Captcha Secret)
    - Skill Verification System
- Maintenance
    - DB Seeding & Initialization Scripts
