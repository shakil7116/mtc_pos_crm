# InvoicePro - Bilingual Invoice Management System

## Overview

InvoicePro is a bilingual (English/Arabic) invoice management application designed for Qatar-based businesses. The system enables users to create, view, print, and manage invoices with voice input capabilities. It features a professional invoice paper template with dual-language support, voice-to-text item entry, and store settings management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, bundled using Vite
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state caching and synchronization
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **Forms**: React Hook Form with Zod validation
- **Animations**: Framer Motion for UI transitions
- **Printing**: react-to-print for invoice PDF/print generation

### Backend Architecture
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript with ESM modules
- **API Pattern**: REST API with typed route definitions in `shared/routes.ts`
- **Build System**: Custom build script using esbuild for server and Vite for client

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` defines all database tables
- **Migrations**: Drizzle Kit with `db:push` command for schema sync
- **Tables**:
  - `settings`: Store configuration (name, address, phone in EN/AR)
  - `invoices`: Invoice header data (number, date, customer, total)
  - `invoiceItems`: Line items for each invoice
  - `conversations` and `messages`: Chat history for AI features

### AI Integrations (Replit AI)
The project uses Replit's AI integrations located in `server/replit_integrations/`:
- **Chat**: OpenAI-powered chat with conversation persistence
- **Audio**: Voice recording, speech-to-text (using ffmpeg for WebM→WAV conversion), and text-to-speech
- **Image**: Image generation via gpt-image-1 model
- **Batch**: Rate-limited batch processing utilities with retry logic

### Key Design Patterns
- **Shared Types**: Schema and route definitions shared between client/server via `@shared/*` path alias
- **Type-safe API**: Zod schemas validate both request inputs and response shapes
- **Component Composition**: UI built from small, reusable shadcn components
- **Print-optimized Layout**: InvoicePaper component designed for A4 printing with `@media print` styles

## External Dependencies

### Database
- PostgreSQL (connection via `DATABASE_URL` environment variable)
- Drizzle ORM for type-safe queries
- connect-pg-simple for session storage

### AI Services (via Replit AI Integrations)
- OpenAI API for chat completions, speech-to-text, and image generation
- Environment variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`

### System Dependencies
- ffmpeg (for audio format conversion, available by default on Replit)

### Key NPM Packages
- `react-to-print`: Invoice printing functionality
- `date-fns`: Date formatting
- `framer-motion`: UI animations
- `p-limit` / `p-retry`: Batch processing rate limiting
- Full shadcn/ui component suite (@radix-ui/*)