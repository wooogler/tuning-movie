# 🎬 Tuning Movie

A Movie Ticket Booking System

## 📋 Overview

Tuning Movie is a full-stack web application for booking movie tickets.

### Key Features

- Browse movie listings
- Select theaters
- Choose showtimes
- Pick seats
- Select ticket types (Adult, Youth, Senior)
- Manage and confirm bookings

### Tech Stack

**Frontend**
- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Zustand (state management)
- React Router DOM

**Backend**
- Fastify
- TypeScript
- Drizzle ORM
- SQLite

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) 18 or higher
- npm (comes with Node.js)

### Installation and Setup

#### 1. Clone the Repository

```bash
git clone <repository-url>
cd tuning-movie
```

#### 2. Install Dependencies

```bash
npm install
```

This command will automatically install all dependencies for the root, frontend, and backend.

#### 3. Initialize the Database

Initialize the backend database and create sample data:

```bash
npm run dev:backend
```

The database will be created automatically on first run.
Once the server starts successfully, press `Ctrl+C` to stop it and proceed to the next step.

To add sample data:

```bash
cd apps/backend
npm run db:seed
cd ../..
```

#### 4. Start Development Servers

##### Option 1: Run Both Servers (Recommended)

```bash
npm run dev
```

This command runs both frontend and backend simultaneously.

##### Option 2: Run Individually

**Backend only**
```bash
npm run dev:backend
```

**Frontend only**
```bash
npm run dev:frontend
```

#### 5. Open in Browser

Frontend: http://localhost:5173
Backend API: http://localhost:3000

## 📁 Project Structure

```
tuning-movie/
├── apps/
│   ├── frontend/          # React frontend
│   │   ├── src/
│   │   │   ├── api/       # API client
│   │   │   ├── components/# React components
│   │   │   ├── pages/     # Chat-based booking page
│   │   │   ├── renderer/  # Declarative rendering engine
│   │   │   ├── spec/      # Agent-facing UI spec and modifiers
│   │   │   ├── store/     # Chat message store
│   │   │   └── types/     # TypeScript types
│   │   └── package.json
│   └── backend/           # Fastify backend
│       ├── src/
│       │   ├── db/        # Database setup and schema
│       │   ├── routes/    # API routes
│       │   └── types/     # TypeScript types
│       └── package.json
├── docs/                  # Project documentation
├── package.json           # Root package.json (monorepo setup)
└── README.md
```

## 🛠️ Development

### Available Scripts

**Root Level**
```bash
npm run dev              # Run frontend + backend simultaneously
npm run dev:frontend     # Run frontend only
npm run dev:backend      # Run backend only
npm run build            # Build entire project
npm run build:frontend   # Build frontend only
npm run build:backend    # Build backend only
```

**Backend (apps/backend)**
```bash
npm run dev              # Start dev server (hot reload)
npm run build            # Compile TypeScript
npm run start            # Start production server
npm run db:generate      # Generate Drizzle migrations
npm run db:push          # Push database schema
npm run db:seed          # Seed sample data
npm run db:studio        # Run Drizzle Studio
```

**Frontend (apps/frontend)**
```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run preview          # Preview production build
npm run lint             # Run ESLint
```

### Database Management

To visually manage and inspect the database schema:

```bash
cd apps/backend
npm run db:studio
```

Drizzle Studio will automatically open in your browser.

## 🌐 API Endpoints

### Movies
- `GET /movies` - Get all movies
- `GET /movies/:id` - Get a specific movie

### Theaters
- `GET /theaters` - Get all theaters
- `GET /theaters/movie/:movieId` - Get theaters showing a specific movie
- `GET /theaters/:id` - Get a specific theater

### Showings
- `GET /showings?movieId=&theaterId=&date=` - Get showings
- `GET /showings/dates?movieId=&theaterId=` - Get available dates for showings
- `GET /showings/times?movieId=&theaterId=&date=` - Get showings for a specific movie, theater, and date
- `GET /showings/:id` - Get a specific showing

### Seats
- `GET /seats/:showingId` - Get seats for a specific showing

### Ticket Types
- `GET /ticket-types` - Get available ticket types

### Bookings
- `POST /bookings` - Create a booking
- `GET /bookings/:id` - Get a booking
- `DELETE /bookings/:id` - Cancel a booking

## 🔧 Environment Variables

### Frontend

To change the API URL for the frontend, create a `.env` file:

```bash
# apps/frontend/.env
VITE_API_URL=http://localhost:3000
```

### Backend

To configure backend runtime settings:

```bash
# apps/backend/.env
PORT=3000
DATABASE_URL=tuning-movie.db
```

The backend loads `apps/backend/.env` automatically at startup and maps keys into `process.env`.

```bash
PORT=3000 DATABASE_URL=tuning-movie.db npm run dev:backend
```

## 🤖 External Agent (Study MVP)

The prototype supports an external agent server through a WebSocket protocol.

- Transport: single WebSocket endpoint (`/agent/ws`)
- Read scope: `uiSpec`, `messageHistory`, `toolSchema`
- Write scope: `tool.call`, `agent.message`
- Excluded from external snapshots: `backendData`
- Session end behavior: flush study logs and reset state

See the canonical spec: [`docs/external-agent-protocol.md`](./docs/external-agent-protocol.md)

## 📚 Additional Documentation

For detailed implementation information, see the [docs](./docs/) directory:

- [Implementation Summary](./docs/implementation-summary.md)
- [Rendering Engine Design](./docs/rendering-engine-design.md)
- [External Agent Protocol (MVP)](./docs/external-agent-protocol.md)

## 🐛 Troubleshooting

### Port Already in Use

**Backend (Port 3000)**
```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Frontend (Port 5173)**
```bash
# macOS/Linux
lsof -ti:5173 | xargs kill -9

# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

### Reset Database

To completely reset the database:

```bash
cd apps/backend
rm -rf drizzle
rm tuning-movie.db
npm run db:push
npm run db:seed
```

## 📄 License

ISC

## 🤝 Contributing

Contributions are always welcome! Please feel free to submit issues or pull requests.
