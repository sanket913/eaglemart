# FreshMart Express Backend

Production-style REST backend for a single-store grocery ecommerce platform.

## Stack

- Node.js + Express 5
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT authentication
- bcrypt password hashing
- Zod validation
- Helmet, CORS, rate limiting

## Setup

```bash
cd backend
copy .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

On Windows you can also double-click `START-BACKEND.bat`. It checks whether PostgreSQL is running before starting the API.

If you see `Can't reach database server at localhost:5432`, PostgreSQL is not running. Install/start PostgreSQL or Docker Desktop, then run the database commands again.

API health:

```text
GET http://localhost:5000/health
```

## Demo Accounts

Admin:

- Email: `admin@freshmart.com`
- Password: `admin123`

Customer:

- Email: `customer@freshmart.com`
- Password: `customer123`

## Commands

- `npm run dev` - start development server
- `npm run build` - compile TypeScript
- `npm run start` - run compiled server
- `npm run db:migrate` - create/apply migration
- `npm run db:push` - push schema without migration
- `npm run db:seed` - seed demo data

## Security Notes

- Keep `JWT_SECRET` and `RAZORPAY_KEY_SECRET` only in backend `.env`.
- Frontend should only receive `RAZORPAY_KEY_ID`.
- Admin APIs require JWT and `ADMIN` role.
- Customer APIs require JWT.
