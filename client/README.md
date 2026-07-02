# ClipFlow Frontend

A modern React application for turning long-form videos into viral short-form clips using AI-powered suggestions.

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- npm or yarn
- Google OAuth credentials

### Installation

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your Google Client ID
```

### Development Server

```bash
npm run dev
```

The app will start at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

## 📁 Project Structure

```
client/
├── src/
│   ├── components/        # Reusable React components
│   │   ├── Header.tsx    # Top navigation bar
│   │   └── Sidebar.tsx   # Left navigation menu
│   ├── pages/            # Page components (route-based)
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── GeneratorPage.tsx
│   │   ├── SchedulePage.tsx
│   │   └── AnalyticsPage.tsx
│   ├── store/            # Zustand state management
│   │   ├── authStore.ts  # Authentication state
│   │   └── clipStore.ts  # Clips management
│   ├── lib/
│   │   └── api.ts        # Axios API client with interceptors
│   ├── App.tsx           # Main app component with routing
│   ├── main.tsx          # React entry point
│   └── index.css         # Global styles with TailwindCSS
├── index.html            # HTML template
├── vite.config.ts        # Vite configuration
├── tailwind.config.js    # TailwindCSS configuration
├── postcss.config.js     # PostCSS configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies
```

## 🔑 Environment Variables

Create a `.env` file in the `client/` directory:

```env
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

### Getting Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google+ API
4. Create OAuth 2.0 credentials (Web application)
5. Add `http://localhost:5173` to authorized redirect URIs
6. Copy the Client ID to your `.env` file

## 🏗️ Architecture

### State Management (Zustand)

**authStore.ts**
- Manages user authentication
- Persists token and user data to localStorage
- Handles login/logout

**clipStore.ts**
- Manages clips state
- CRUD operations for clips
- Persists to API

### API Client

The API client (`lib/api.ts`) includes:
- Base URL configuration from environment
- Automatic JWT token attachment to requests
- Automatic redirect to login on 401 responses
- Error handling

### Components

**Header**
- User profile display
- Logout functionality
- Branding

**Sidebar**
- Navigation to all sections
- Active route highlighting
- Responsive design

## 📄 Pages Overview

### Login Page (`/login`)
- Google OAuth integration
- Redirects to dashboard on successful login
- Checks for token in URL params

### Dashboard (`/dashboard`)
- Overview statistics
- Recent clips list
- Quick access to all features

### Clip Generator (`/generator`)
- YouTube URL input
- AI-powered clip suggestions
- Create clips from suggestions
- Shows video metadata

### Schedule (`/schedule`)
- Schedule clips for publishing
- Multi-platform support (YouTube, TikTok, Instagram)
- Calendar view of scheduled content

### Analytics (`/analytics`)
- Performance metrics
- Views, likes, shares tracking
- Engagement rate analysis
- Per-clip performance table

## 🎨 Styling

Uses **TailwindCSS** with custom configuration:
- Custom color scheme (primary blue, secondary gray, accent amber)
- Responsive utilities
- Custom component classes (.btn, .card, .input)

## 🔐 Authentication Flow

1. User clicks "Sign in with Google"
2. Redirected to backend OAuth endpoint
3. Backend exchanges code for token
4. Redirected back with token in URL params
5. Token stored in localStorage
6. All subsequent API requests include token in Authorization header

## 🚀 Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

## 📦 Dependencies

- **React 18** - UI framework
- **React Router v6** - Client-side routing
- **Zustand** - State management
- **Axios** - HTTP client
- **TailwindCSS** - Utility-first CSS framework
- **Lucide React** - Icon library
- **React Hot Toast** - Toast notifications
- **Vite** - Build tool

## 🔄 API Integration

The frontend expects the backend API at `http://localhost:5000` with endpoints:

- `POST /api/auth/google/url` - Get Google OAuth URL
- `GET /api/analytics/overview` - Dashboard stats
- `POST /api/videos/analyze` - Analyze video for clips
- `POST /api/clips` - Create new clip
- `GET /api/schedule` - Get scheduled clips
- `POST /api/schedule` - Schedule clip for publishing
- `GET /api/analytics/clips` - Get clip analytics

## 🐛 Troubleshooting

### "Cannot find module" errors
```bash
npm install
```

### Port 5173 already in use
```bash
npm run dev -- --port 3000
```

### Google OAuth not working
- Verify Client ID in `.env`
- Check redirect URI in Google Cloud Console
- Ensure backend is running

## 📝 Notes

- The app uses client-side routing with React Router
- State persists across page refreshes for auth
- API errors automatically redirect to login if unauthenticated
- Toast notifications provide user feedback

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Create a pull request

## 📄 License

This project is part of ClipFlow
