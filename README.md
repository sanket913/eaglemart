# FreshMart Express

This is a Vite React single page app. Do not open `index.html` directly with `file://`.

## Run

Double-click `START-FRESHMART.bat`, or run:

```bash
npm run dev
```

Then open:

- Customer: `http://127.0.0.1:5173`
- Admin: `http://127.0.0.1:5173/admin`

Admin demo login:

- Email: `admin@freshmart.com`
- Password: `admin123`

## Deploy Frontend On Vercel

1. Push the latest code to GitHub.
2. Open Vercel and import `sanket913/eaglemart`.
3. Use these settings:
   - Framework preset: `Vite`
   - Root directory: project root
   - Build command: `npm run build`
   - Output directory: `dist`
4. Add this environment variable in Vercel:
   - `VITE_API_URL=https://YOUR-RENDER-BACKEND.onrender.com/api`
5. Deploy.

The included `vercel.json` keeps `/admin` working and sends all SPA routes to `index.html`.

## Deploy Backend On Render

1. Open Render and create a Blueprint from this GitHub repo, or create a Web Service manually.
2. If using Blueprint, Render reads `render.yaml` and creates:
   - `eaglemart-backend`
   - `eaglemart-db`
3. If creating manually:
   - Root directory: `backend`
   - Build command: `npm install && npm run db:generate && npm run build`
   - Start command: `npx prisma db push && npm run db:seed && npm start`
4. Add backend environment variables:
   - `NODE_ENV=production`
   - `USE_MEMORY_DB=false`
   - `DATABASE_URL=<Render PostgreSQL internal database URL>`
   - `JWT_SECRET=<long random secret>`
   - `JWT_EXPIRES_IN=7d`
   - `FRONTEND_URL=https://YOUR-VERCEL-SITE.vercel.app`
   - `RAZORPAY_KEY_ID=<your Razorpay test key id>`
   - `RAZORPAY_KEY_SECRET=<your Razorpay test key secret>`
5. After both deployments finish, update:
   - Vercel `VITE_API_URL` with the real Render backend URL plus `/api`
   - Render `FRONTEND_URL` with the real Vercel frontend URL
6. Redeploy both services.
