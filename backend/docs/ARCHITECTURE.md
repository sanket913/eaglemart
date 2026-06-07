# Backend Architecture

FreshMart Express uses a modular REST architecture:

- `src/app.ts` wires security, middleware, and routes.
- `src/routes` contains feature modules.
- `src/middleware` contains auth and error middleware.
- `src/utils` contains auth, pricing, async, and API error helpers.
- `prisma/schema.prisma` defines database models and relations.
- `prisma/seed.ts` creates demo users, categories, products, coupons, banners, settings, and orders.

## Data Flow

1. Customer logs in and receives a JWT.
2. Customer adds products to a persistent database cart.
3. Checkout validates stock, minimum order value, coupon rules, delivery fee, and tax.
4. Order creation runs inside a transaction.
5. Product stock and inventory are reduced after successful order creation.
6. Payment status can be updated through COD, demo success, Razorpay verification, or failure APIs.
7. Admin status updates create customer notifications.

## Scalability

- PostgreSQL database via Prisma.
- Transactional order creation for stock consistency.
- Stateless JWT auth suitable for horizontal scaling.
- Secrets are environment-driven.
- Modules can be split into services later without changing API contracts.
