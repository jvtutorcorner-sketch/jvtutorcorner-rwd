# JVTutorCorner RWD Project Diagram (Xmind Style)

This document provides a high-level mind map of the JVTutorCorner project architecture, components, and technology stack.

```mermaid
mindmap
  root((JVTutorCorner RWD))
    Frontend
      Next.js 16
        App Router
        Server Components
      React 18
      Tailwind CSS 4
      UI Components
        AWS Amplify UI
        Radix UI / Custom
      Editor & Visuals
        Monaco Editor
        Konva / React-Konva
        React Flow / XYFlow
    Backend
      AWS Amplify
        AppSync (GraphQL)
        Cognito (Auth)
        S3 (Storage)
        DynamoDB
      API Routes
        Next.js API Handler
        Internal Services
      Database Models
        User (Student/Teacher/Admin)
        Course & Enrollment
        Order & Payment
        Appointment & Feedback
    Key Features
      Course Management
      Student Enrollment Flow
      AI Integration
        Gemini AI
      Payment Gateways
        PayPal
        Stripe
        LinePay
        ECPay
      Live Classroom
        Agora RTC/RTM
        Whiteboard
    Infrastructure & Tools
      CI/CD
        GitHub Actions
        Amplify Hosting
      Testing
        Playwright (E2E)
        Vitest / Jest
      Automation Scripts
        Database Seeding
        Migration Tools
      Documentation
        Architecture Overview
        Skill Definitions
```

## Description of Branches

- **Frontend**: Rooted in Next.js 16, utilizing modern React features and Tailwind CSS 4 for a responsive, premium UI. Visual tools like Monaco, Konva, and React Flow empower the interactive parts of the platform.
- **Backend**: Leverages the AWS Amplify ecosystem for a scalable, serverless architecture. GraphQL serves as the primary data interface.
- **Key Features**: Covers the core business logic, including the tutoring workflow, AI-assisted learning (Gemini), multi-gateway payment support, and real-time classroom capabilities via Agora.
- **Infrastructure & Tools**: Ensures project quality and maintainability through automated testing, deployment pipelines, and comprehensive documentation.
