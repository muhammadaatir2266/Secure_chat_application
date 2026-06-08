# Secure Chat Application

End-to-end encrypted web chat with AES-256-GCM and ECDH key exchange.

## Features

- 🔒 **End-to-End Encryption**: AES-256-GCM encryption
- 🔑 **Key Exchange**: ECDH (Elliptic Curve Diffie-Hellman) using P-256 curve
- 💬 **Real-time Chat**: WebSocket-based instant messaging
- 👤 **Username Support**: Set and edit your display name
- 🎨 **Modern UI**: Beautiful interface built with Next.js, React, and shadcn/ui
- 🔐 **Secure by Design**: Messages never stored, only relayed through server

## Architecture

```
secure_chat/
├── backend/
│   ├── server.py              # TCP relay server
│   ├── websocket_server.py    # WebSocket bridge for browsers
│   ├── crypto_utils.py        # Encryption utilities
│   └── requirements.txt       # Python dependencies
├── frontend/
│   ├── app/
│   │   ├── page.tsx           # Main chat interface
│   │   └── hooks/
│   │       └── useCrypto.ts   # Crypto operations (ECDH + AES-GCM)
│   ├── components/ui/         # shadcn/ui components
│   └── package.json           # Node dependencies
└── README.md
```

## Deployment on Railway

Railway provides easy deployment for both backend and frontend with automatic SSL/TLS.

### Prerequisites

- GitHub account
- Railway account (sign up at https://railway.app)
- Git installed locally

### Step 1: Prepare Your Code

**1. Create necessary configuration files:**

Create `backend/railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "python server.py & python websocket_server.py & wait",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Create `backend/Procfile`:
```
web: python server.py & python websocket_server.py & wait
```

Create `backend/runtime.txt`:
```
python-3.11.0
```

**2. Update frontend for production:**

Create `frontend/.env.production`:
```env
NEXT_PUBLIC_WS_URL=wss://your-backend-name.up.railway.app
```

Update `frontend/app/page.tsx` (around line 88):
```typescript
const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8765';
const ws = new WebSocket(wsUrl);
```

### Step 2: Push Code to GitHub

**1. Initialize git repository (if not already done):**
```bash
cd secure_chat
git init
git add .
git commit -m "Initial commit"
```

**2. Create GitHub repository:**
- Go to https://github.com/new
- Create a new repository (e.g., "secure-chat")
- Don't initialize with README (you already have one)

**3. Push to GitHub:**
```bash
git remote add origin https://github.com/YOUR_USERNAME/secure-chat.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy Backend on Railway

**1. Log in to Railway:**
- Go to https://railway.app
- Sign in with GitHub

**2. Create New Project:**
- Click "New Project"
- Select "Deploy from GitHub repo"
- Choose your `secure-chat` repository
- Railway will detect both backend and frontend

**3. Configure Backend Service:**
- Railway will create a service automatically
- Click on the service
- Go to "Settings"
- Set **Root Directory** to `backend`
- Set **Start Command** to: `python server.py & python websocket_server.py`

**4. Add Environment Variables (if needed):**
- Go to "Variables" tab
- Add any environment variables (none required for basic setup)

**5. Generate Domain:**
- Go to "Settings" tab
- Click "Generate Domain" under "Domains"
- Copy the domain (e.g., `your-app.up.railway.app`)
- This will be your WebSocket URL

**6. Configure Ports:**
- Railway automatically exposes the first port your app listens on
- The backend listens on ports 5555 and 8765
- Railway will use port 8765 (WebSocket) as the public port

### Step 4: Deploy Frontend on Railway

**1. Add Another Service:**
- In your Railway project, click "New"
- Select "GitHub Repo" → Choose the same repository
- Configure the new service

**2. Configure Frontend Service:**
- Set **Root Directory** to `frontend`
- Set **Build Command** to: `npm install && npm run build`
- Set **Start Command** to: `npm start`

**3. Add Environment Variables:**
- Go to "Variables" tab
- Add: `NEXT_PUBLIC_WS_URL` = `wss://YOUR_BACKEND_DOMAIN.up.railway.app`
- Replace `YOUR_BACKEND_DOMAIN` with your backend domain from Step 3

**4. Generate Domain:**
- Go to "Settings"
- Click "Generate Domain"
- This will be your app's public URL

### Step 5: Update Frontend with Backend URL

**1. Update your code locally:**

Edit `frontend/.env.production`:
```env
NEXT_PUBLIC_WS_URL=wss://your-backend-name.up.railway.app
```

**2. Commit and push:**
```bash
git add frontend/.env.production
git commit -m "Update backend URL"
git push
```

Railway will automatically redeploy your frontend.

### Step 6: Test Your Deployment

**1. Access your app:**
```
https://your-frontend-name.up.railway.app
```

**2. Test the chat:**
- Open the URL in two browser tabs
- Click "Connect" in both tabs
- Enter names when prompted
- Wait for "🔒 Secure connection established"
- Start chatting!

### Alternative: Deploy Both Services with Railway CLI

**1. Install Railway CLI:**
```bash
npm install -g @railway/cli
```

**2. Login:**
```bash
railway login
```

**3. Initialize project:**
```bash
cd secure_chat
railway init
```

**4. Deploy backend:**
```bash
cd backend
railway up
```

**5. Deploy frontend:**
```bash
cd ../frontend
railway up
```

**6. Link services:**
```bash
railway service
```
Follow prompts to link frontend with backend.

## Configuration Details

### Backend Railway Configuration

The backend needs to:
- Run both `server.py` (TCP server on port 5555)
- Run `websocket_server.py` (WebSocket on port 8765)
- Be accessible via WSS (WebSocket Secure)

Railway automatically:
- Provides SSL/TLS certificates
- Exposes your app via HTTPS/WSS
- Restarts services on failure

### Frontend Railway Configuration

The frontend needs to:
- Build Next.js for production
- Connect to backend via `NEXT_PUBLIC_WS_URL`
- Serve on port 3000 (Railway handles this)

## Troubleshooting

**Backend service won't start:**
- Check Railway logs: Click on service → "Deployments" → Latest deployment → View logs
- Verify `requirements.txt` includes `websockets`
- Ensure start command is correct

**Frontend can't connect to backend:**
- Verify `NEXT_PUBLIC_WS_URL` environment variable is set correctly
- Check it uses `wss://` (not `ws://`)
- Ensure backend domain is correct

**WebSocket connection fails:**
- Check backend is running: View logs in Railway dashboard
- Verify firewall isn't blocking WebSocket connections
- Test backend directly: Use online WebSocket tester

**Environment variables not working:**
- Redeploy after adding environment variables
- Check variable names match exactly (case-sensitive)
- For frontend env vars, they must start with `NEXT_PUBLIC_`

**Build fails:**
- Check build logs in Railway dashboard
- Verify all dependencies are in `package.json` / `requirements.txt`
- Ensure Python/Node versions are compatible

## Railway Pricing

- **Free Tier**: $5 of usage per month
- **Usage**: Charged based on resource consumption
- **Hobby Plan**: $5/month for more resources
- **Sleep Policy**: Free tier services sleep after inactivity

For development/academic projects, the free tier should be sufficient.

## Important Notes

- **2-User Limit**: Supports only 2 users at a time (P2P encryption)
- **No Message Storage**: Messages are not saved, only relayed
- **Session-based**: New keys generated each session
- **Automatic SSL**: Railway provides SSL/TLS automatically
- **Environment Variables**: Frontend vars must start with `NEXT_PUBLIC_`

## Technology Stack

**Frontend:**
- Next.js 14
- React 18  
- TypeScript
- shadcn/ui
- Tailwind CSS
- Web Crypto API

**Backend:**
- Python 3.11
- websockets library
- TCP sockets

## Security Considerations

✅ **Provides:**
- End-to-end encryption
- Perfect forward secrecy
- Authenticated encryption
- Automatic SSL/TLS via Railway

⚠️ **Limitations:**
- No persistent authentication
- No message history
- Server can see metadata (connections, timing)
- Academic/demo project only

## License

Academic project for educational purposes demonstrating end-to-end encryption concepts.
