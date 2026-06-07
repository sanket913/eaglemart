# Eagle Mart

Premium grocery ecommerce platform with a modern customer storefront, protected admin dashboard, secure checkout, Razorpay-ready payments, saved cart, wishlist, live order tracking, inventory control, coupons, and customer management.

## Live Demo

- Customer website: [https://eaglemart.vercel.app](https://eaglemart.vercel.app)
- Backend API: [https://eaglemart.onrender.com](https://eaglemart.onrender.com)
- Admin panel: [https://eaglemart.vercel.app/admin](https://eaglemart.vercel.app/admin)

## Demo Accounts

Admin:

```text
Email: admin@freshmart.com
Password: admin123
```

Customer:

```text
Email: customer@freshmart.com
Password: customer123
```

## Highlights

- Single Page Application customer storefront.
- `/admin` protected admin route with role-based access.
- Premium Eagle Mart theme with gold, charcoal, glassmorphism, smooth cards, and responsive layouts.
- Dynamic products, categories, coupons, settings, orders, inventory, wishlist, cart, and enquiries.
- Customer login, signup, profile edit, saved addresses, default address selection, order history, tracking, cancel/refund flow, and downloadable invoice PDF.
- Cart and wishlist sync only for logged-in customers.
- Checkout with Cash on Delivery and Razorpay test payment flow.
- Admin product management with add, edit, delete, image upload/URL, status control, stock control, coupon management, customer block/delete, settings, and enquiries.
- PostgreSQL-ready backend with Prisma schema and seed data.

## Tech Stack

Frontend:

- React
- TypeScript
- Vite
- Lucide React
- jsPDF
- Responsive CSS with premium ecommerce UI patterns

Backend:

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT authentication
- bcrypt password hashing
- Zod validation
- Helmet, CORS, rate limiting

Deployment:

- Frontend: Vercel
- Backend: Render
- Database: Render PostgreSQL

## Project Structure

```text
eaglemart/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── config/
│   │   └── utils/
│   ├── .env.example
│   └── package.json
├── public/
│   └── eagle_logo.png
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   └── style.css
├── render.yaml
├── vercel.json
└── package.json
```

## Run Locally

Install frontend dependencies:

```bash
npm install
```

Install backend dependencies:

```bash
cd backend
npm install
```

Create backend environment file:

```bash
copy .env.example .env
```

Start PostgreSQL using Docker:

```bash
docker compose up -d
```

Generate Prisma client, push schema, and seed data:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

Start backend:

```bash
npm run dev
```

Start frontend in a second terminal:

```bash
npm run dev
```

Local URLs:

- Customer: `http://127.0.0.1:5173`
- Admin: `http://127.0.0.1:5173/admin`
- API health: `http://127.0.0.1:5000/health`

## Environment Variables

Frontend on Vercel:

```env
VITE_API_URL=https://eaglemart.onrender.com/api
```

Backend on Render:

```env
NODE_ENV=production
USE_MEMORY_DB=false
DATABASE_URL=<Render PostgreSQL internal database URL>
JWT_SECRET=<long secure random secret>
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://eaglemart.vercel.app
RAZORPAY_KEY_ID=<Razorpay test key id>
RAZORPAY_KEY_SECRET=<Razorpay test key secret>
```

Never commit real `.env` files or payment/database secrets.

## Deploy Frontend On Vercel

1. Import this GitHub repository into Vercel.
2. Use these settings:
   - Framework preset: `Vite`
   - Root directory: project root
   - Build command: `npm run build`
   - Output directory: `dist`
3. Add `VITE_API_URL`.
4. Deploy.

The included `vercel.json` keeps the SPA working and allows `/admin` to load correctly.

## Deploy Backend On Render

1. Create a Render PostgreSQL database.
2. Create a Render Web Service from this repository.
3. Use backend root directory:

```text
backend
```

4. Build command:

```bash
npm install && npm run db:generate && npm run build
```

5. Start command:

```bash
npx prisma db push && npm run db:seed && npm start
```

6. Add backend environment variables from the section above.
7. Deploy.

## Security Notes

- JWT protects customer and admin routes.
- Admin APIs require `ADMIN` role.
- Passwords are hashed with bcrypt.
- Razorpay secret key stays only on the backend.
- Frontend only uses the public Razorpay key ID.
- CORS is configured for the deployed frontend.
- `.env`, build folders, runtime data, and `node_modules` are ignored by Git.

## Production Checklist

- Set Vercel `VITE_API_URL` to the Render backend `/api` URL.
- Set Render `FRONTEND_URL` to the Vercel frontend URL.
- Use Render PostgreSQL internal database URL for `DATABASE_URL`.
- Keep Razorpay in test mode until real payment verification is ready for production.
- Rotate secrets if they are ever pasted publicly.
- Redeploy frontend after changing Vercel environment variables.
- Redeploy backend after changing Render environment variables.

## License

This project is for learning, portfolio, and ecommerce platform development practice.
