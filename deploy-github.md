# GitHub Pages + Backend Deployment

## Frontend (GitHub Pages)
1. Create a new repository for frontend only
2. Copy all files from `public/` folder
3. Enable GitHub Pages in repository settings
4. Update socket connection in app.js to point to your backend URL

## Backend (Railway/Render)
1. Create separate repository with just server.js, package.json, and data handling
2. Deploy using Railway or Render as described above
3. Update CORS settings to allow your GitHub Pages domain

## Configuration
Update the socket connection in your frontend:
```javascript
const socket = io('https://your-backend-url.railway.app');
```