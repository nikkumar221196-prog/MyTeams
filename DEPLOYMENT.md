# Deployment Guide for MyTeams

## Option 1: Deploy to Vercel (Recommended - Free)

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy from your project directory:**
   ```bash
   vercel
   ```

4. **Follow the prompts:**
   - Project name: `myteams` (or your preferred name)
   - Deploy: Yes
   - Your app will be live at: `https://myteams-[random].vercel.app`

5. **Custom Domain (Optional):**
   - In Vercel dashboard, go to your project
   - Go to Settings → Domains
   - Add your custom domain (e.g., myteams.com)

## Option 2: Deploy to Railway (Free)

1. Visit [Railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway will automatically detect it's a Node.js app
6. Your app will be live at: `https://[project-name].up.railway.app`

## Option 3: Deploy to Render (Free)

1. Visit [Render.com](https://render.com)
2. Sign up with GitHub
3. Click "New" → "Web Service"
4. Connect your repository
5. Configure:
   - Build Command: `npm install`
   - Start Command: `npm start`
6. Deploy!

## Option 4: Deploy to Heroku (Free tier discontinued, paid plans available)

1. Install Heroku CLI
2. Create a Heroku app:
   ```bash
   heroku create myteams-app
   ```
3. Deploy:
   ```bash
   git push heroku main
   ```

## Custom Domain Setup

To get a URL like "myteams.com":

1. **Purchase a domain** from:
   - Namecheap
   - GoDaddy  
   - Cloudflare
   - Google Domains

2. **Configure DNS:**
   - Add a CNAME record pointing to your deployment URL
   - Or use A records with the IP address

3. **Add domain to your platform:**
   - Vercel: Project Settings → Domains
   - Railway: Project → Settings → Domains
   - Render: Dashboard → Domains

## Environment Variables (If needed in future)

If you add environment variables:

```bash
# For Vercel
vercel env add

# For Railway
# Add in dashboard under Variables tab

# For Render
# Add in dashboard under Environment tab
```

## Post-Deployment Checklist

- ✅ App loads correctly
- ✅ Users can join teams
- ✅ Real-time chat works
- ✅ Online status updates
- ✅ Message deletion works
- ✅ Settings can be updated
- ✅ Mobile responsive

## Troubleshooting

**Socket.io connection issues:**
- Check if WebSocket connections are allowed
- Some hosting platforms require specific configuration

**Memory issues:**
- The current app stores data in memory
- For production, consider adding a database (MongoDB, PostgreSQL)

**Performance:**
- Current setup handles ~100 concurrent users
- For more users, consider Redis for session management

## Monitoring

Free monitoring tools:
- Vercel Analytics (built-in)
- Railway Metrics (built-in)
- UptimeRobot (external)

Your MyTeams app is now live and ready for your team to use!