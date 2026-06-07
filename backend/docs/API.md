# FreshMart Express API

Base URL: `http://localhost:5000/api`

Use `Authorization: Bearer <token>` for protected routes.

## Auth

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

## Products

- `GET /products`
- `GET /products/search?q=milk`
- `GET /products/:idOrSlug`
- `POST /products` admin
- `PUT /products/:id` admin
- `DELETE /products/:id` admin

Product filters:

```text
GET /products?search=milk&category=dairy&brand=Milko&minPrice=50&maxPrice=500&rating=4.5&discount=10&sort=price-low
```

## Categories

- `GET /categories`
- `POST /categories` admin
- `PUT /categories/:id` admin
- `DELETE /categories/:id` admin

## Cart

- `GET /cart`
- `POST /cart/items`
- `PATCH /cart/items/:productId`
- `DELETE /cart/items/:productId`
- `DELETE /cart`

## Wishlist

- `GET /wishlist`
- `POST /wishlist`
- `DELETE /wishlist/:productId`

## Orders

- `POST /orders`
- `GET /orders`
- `GET /orders/:orderId`
- `GET /orders/:orderId/track`
- `POST /orders/:orderId/reorder`
- `GET /orders/admin/all` admin
- `PATCH /orders/:orderId/status` admin

Order statuses:

- `Pending`
- `Confirmed`
- `Packed`
- `OutForDelivery`
- `Delivered`
- `Cancelled`

## Coupons

- `POST /coupons/apply`
- `POST /coupons` admin
- `PUT /coupons/:id` admin
- `DELETE /coupons/:id` admin

Seed coupons:

- `FRESH10`
- `FREEDEL`
- `SAVE50`
- `WELCOME20`
- `BIGSAVE`

## Payments

- `POST /payments/create-order`
- `POST /payments/verify`
- `POST /payments/demo-success`
- `POST /payments/failure`

Payment methods:

- `COD`
- `DEMO_ONLINE`
- `RAZORPAY`

Payment statuses:

- `Pending`
- `Paid`
- `Failed`
- `Refunded`

## Reviews

- `GET /reviews/product/:productId`
- `POST /reviews/product/:productId`

## Public Homepage

- `GET /public/home`

## Admin

- `GET /admin/dashboard`
- `GET /admin/analytics/revenue`
- `GET /admin/customers`
- `GET /admin/inventory`
- `GET /admin/inventory/low-stock`
- `PATCH /admin/inventory/:productId`
- `GET /admin/settings`
- `PUT /admin/settings`
- `GET /admin/banners`
- `POST /admin/banners`
- `PUT /admin/banners/:id`
- `DELETE /admin/banners/:id`
