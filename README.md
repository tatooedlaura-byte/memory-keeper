# Memory Keeper

A beautiful, private app for capturing memories - no dates required, no streaks, no mood tracking. Just your memories, photos, audio clips, and videos, all safely backed up to the cloud.

## Features

- **Write memories freely** - No forced dates or timelines
- **Attach media** - Photos, audio clips, or video from your device
- **Tag and search** - Find memories by keywords or tags
- **Password protected** - Secure login with email/password
- **Cloud backup** - All data synced to Firebase
- **Works offline** - PWA that works without internet
- **Installable** - Add to home screen on iOS/Android

## Setup Instructions

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" (or "Add project")
3. Give your project a name (e.g., "memory-keeper")
4. Disable Google Analytics (optional, not needed)
5. Click "Create project"

### 2. Enable Authentication

1. In Firebase Console, go to **Build > Authentication**
2. Click "Get started"
3. Under "Sign-in method", click **Email/Password**
4. Toggle "Enable" and click "Save"

### 3. Create Firestore Database

1. Go to **Build > Firestore Database**
2. Click "Create database"
3. Choose "Start in production mode"
4. Select a location close to you
5. Click "Enable"

### 4. Set Up Firestore Security Rules

In Firestore, go to the **Rules** tab and paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /memories/{memoryId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

Click "Publish".

### 5. Set Up Firebase Storage

1. Go to **Build > Storage**
2. Click "Get started"
3. Choose "Start in production mode"
4. Click "Next" and "Done"

### 6. Set Up Storage Security Rules

In Storage, go to the **Rules** tab and paste:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /memories/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Click "Publish".

### 7. Get Your Firebase Config

1. In Firebase Console, click the gear icon > **Project settings**
2. Scroll down to "Your apps" and click the **</>** (Web) icon
3. Register your app with a nickname (e.g., "memory-keeper-web")
4. Copy the `firebaseConfig` object values

### 8. Configure the App

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your Firebase config values in `.env`:
   ```
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

### 9. Generate PWA Icons (Optional)

For proper PWA support, generate icons:

```bash
# Using an online tool like https://realfavicongenerator.net/
# Or create PNG files manually:
# - pwa-192x192.png (192x192 pixels)
# - pwa-512x512.png (512x512 pixels)
# - apple-touch-icon.png (180x180 pixels)
# Place them in the /public folder
```

### 10. Run the App

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment Options

### Vercel (Recommended - Free)
1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Add your environment variables in Vercel dashboard
5. Deploy!

### Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
npm run build
firebase deploy
```

### Netlify
1. Push your code to GitHub
2. Go to [netlify.com](https://netlify.com)
3. Import your repository
4. Set build command: `npm run build`
5. Set publish directory: `dist`
6. Add environment variables
7. Deploy!

## Installing as an App

### On iPhone/iPad
1. Open the app in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"

### On Android
1. Open the app in Chrome
2. Tap the menu (three dots)
3. Tap "Add to Home screen" or "Install app"

### On Desktop
1. Open the app in Chrome/Edge
2. Click the install icon in the address bar
3. Click "Install"

## Tech Stack

- React + TypeScript
- Vite
- Firebase (Auth, Firestore, Storage)
- PWA with Workbox
