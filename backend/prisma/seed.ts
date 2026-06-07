import { PrismaClient } from '@prisma/client';
import slugify from 'slugify';
import { hashPassword } from '../src/utils/auth.js';
import { firstImage } from '../src/utils/images.js';

const prisma = new PrismaClient();

const categories = [
  'Fresh Fruits', 'Vegetables', 'Dairy', 'Bakery', 'Snacks',
  'Beverages', 'Daily Essentials', 'Household', 'Organic', 'Pet Care',
];

const products = [
  ['Alphonso Mangoes', 'Fresh Fruits', 'Harvest & Co', '1 kg'], ['Royal Gala Apples', 'Fresh Fruits', 'Farmcrest', '4 pcs'],
  ['Sweet Bananas', 'Fresh Fruits', 'FreshMart', '12 pcs'], ['Kiwi Gold Pack', 'Fresh Fruits', 'Urban Pantry', '3 pcs'],
  ['Dragon Fruit', 'Fresh Fruits', 'Harvest & Co', '1 pc'], ['English Cucumber', 'Vegetables', 'Farmcrest', '500 g'],
  ['Cherry Tomatoes', 'Vegetables', 'FreshMart', '250 g'], ['Baby Spinach', 'Vegetables', 'Harvest & Co', '200 g'],
  ['Broccoli Crown', 'Vegetables', 'Urban Pantry', '1 pc'], ['Carrot Bundle', 'Vegetables', 'Farmcrest', '1 kg'],
  ['A2 Cow Milk', 'Dairy', 'Milko', '1 L'], ['Greek Yogurt', 'Dairy', 'Milko', '400 g'],
  ['Farm Butter', 'Dairy', 'Golden Spoon', '200 g'], ['Paneer Cubes', 'Dairy', 'FreshMart', '250 g'],
  ['Cheddar Slices', 'Dairy', 'Milko', '10 slices'], ['Sourdough Loaf', 'Bakery', 'Golden Spoon', '400 g'],
  ['Butter Croissants', 'Bakery', 'Golden Spoon', '4 pcs'], ['Multigrain Bread', 'Bakery', 'FreshMart', '450 g'],
  ['Blueberry Muffins', 'Bakery', 'Urban Pantry', '6 pcs'], ['Pita Pockets', 'Bakery', 'Golden Spoon', '8 pcs'],
  ['Sea Salt Chips', 'Snacks', 'Urban Pantry', '150 g'], ['Trail Mix Jar', 'Snacks', 'Harvest & Co', '300 g'],
  ['Dark Chocolate', 'Snacks', 'Golden Spoon', '100 g'], ['Roasted Almonds', 'Snacks', 'Harvest & Co', '250 g'],
  ['Masala Crackers', 'Snacks', 'FreshMart', '200 g'], ['Cold Brew Coffee', 'Beverages', 'Urban Pantry', '250 ml'],
  ['Orange Juice', 'Beverages', 'FreshMart', '1 L'], ['Sparkling Water', 'Beverages', 'Golden Spoon', '6 cans'],
  ['Kombucha Berry', 'Beverages', 'Urban Pantry', '330 ml'], ['Green Tea Box', 'Beverages', 'Harvest & Co', '25 bags'],
  ['Basmati Rice', 'Daily Essentials', 'FreshMart', '5 kg'], ['Whole Wheat Atta', 'Daily Essentials', 'Golden Spoon', '5 kg'],
  ['Cold Pressed Oil', 'Daily Essentials', 'Harvest & Co', '1 L'], ['Organic Sugar', 'Daily Essentials', 'Farmcrest', '1 kg'],
  ['Free Range Eggs', 'Daily Essentials', 'Farmcrest', '12 pcs'], ['Laundry Liquid', 'Household', 'FreshMart', '2 L'],
  ['Dishwash Gel', 'Household', 'Urban Pantry', '750 ml'], ['Kitchen Towels', 'Household', 'FreshMart', '4 rolls'],
  ['Floor Cleaner', 'Household', 'Golden Spoon', '1 L'], ['Scented Candles', 'Household', 'Urban Pantry', '2 pcs'],
  ['Organic Quinoa', 'Organic', 'Harvest & Co', '500 g'], ['Organic Honey', 'Organic', 'Farmcrest', '350 g'],
  ['Organic Lentils', 'Organic', 'FreshMart', '1 kg'], ['Organic Muesli', 'Organic', 'Golden Spoon', '450 g'],
  ['Organic Tofu', 'Organic', 'Urban Pantry', '250 g'], ['Premium Pet Kibble', 'Pet Care', 'FreshMart', '2 kg'],
  ['Tuna Cat Treats', 'Pet Care', 'Urban Pantry', '120 g'], ['Pet Shampoo', 'Pet Care', 'Golden Spoon', '500 ml'],
  ['Paw Wipes', 'Pet Care', 'FreshMart', '80 pcs'], ['Chicken Pet Bites', 'Pet Care', 'Farmcrest', '200 g'],
];

async function main() {
  await prisma.storeSettings.upsert({
    where: { id: 'default-store-settings' },
    update: {},
    create: { id: 'default-store-settings', storeName: 'FreshMart Express' },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@freshmart.com' },
    update: {},
    create: {
      name: 'FreshMart Admin',
      email: 'admin@freshmart.com',
      phone: '+91 90000 00001',
      role: 'ADMIN',
      passwordHash: await hashPassword('admin123'),
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@freshmart.com' },
    update: {},
    create: {
      name: 'FreshMart Customer',
      email: 'customer@freshmart.com',
      phone: '+91 90000 00002',
      role: 'CUSTOMER',
      passwordHash: await hashPassword('customer123'),
      cart: { create: {} },
      wishlist: { create: {} },
      addresses: {
        create: {
          label: 'Home',
          name: 'FreshMart Customer',
          phone: '+91 90000 00002',
          line1: 'Flat 1201, Premium Heights',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400050',
          isDefault: true,
        },
      },
    },
  });

  const categoryMap = new Map<string, string>();
  for (const [index, name] of categories.entries()) {
    const category = await prisma.category.upsert({
      where: { slug: slugify(name, { lower: true, strict: true }) },
      update: {},
      create: { name, slug: slugify(name, { lower: true, strict: true }), sortOrder: index + 1 },
    });
    categoryMap.set(name, category.id);
  }

  for (const [index, item] of products.entries()) {
    const [name, category, brand, unit] = item;
    const price = 79 + ((index * 37) % 520);
    const discount = [8, 12, 16, 20, 24, 30][index % 6];
    const mrp = Math.round(price / (1 - discount / 100));
    const stock = 20 + ((index * 11) % 70);
    await prisma.product.upsert({
      where: { slug: slugify(name, { lower: true, strict: true }) },
      update: {},
      create: {
        name,
        slug: slugify(name, { lower: true, strict: true }),
        brand,
        categoryId: categoryMap.get(category)!,
        description: `${name} from ${brand}, quality checked and packed fresh for FreshMart Express customers.`,
        images: `https://source.unsplash.com/900x700/?grocery,${encodeURIComponent(name)}`,
        mrp,
        sellingPrice: price,
        discount,
        unit,
        stock,
        lowStockThreshold: 8,
        rating: Number((4.1 + ((index % 9) * 0.1)).toFixed(1)),
        reviewCount: 20 + index,
        isFeatured: index % 4 === 0,
        isBestSeller: index % 5 === 0,
        inventory: { create: { stock } },
      },
    });
  }

  await prisma.coupon.createMany({
    data: [
      { code: 'FRESH10', description: '10% off', type: 'PERCENTAGE', value: 10, maxDiscount: 100 },
      { code: 'FREEDEL', description: 'Free delivery', type: 'FREE_DELIVERY', value: 0 },
      { code: 'SAVE50', description: 'Rs 50 off above Rs 499', type: 'FIXED', value: 50, minOrderValue: 499 },
      { code: 'WELCOME20', description: '20% off first order', type: 'PERCENTAGE', value: 20, maxDiscount: 200, firstOrderOnly: true },
      { code: 'BIGSAVE', description: 'Rs 100 off above Rs 999', type: 'FIXED', value: 100, minOrderValue: 999 },
    ],
  });

  await prisma.banner.createMany({
    data: [
      { title: 'Premium grocery delivery', subtitle: 'Fresh baskets in 20 minutes', image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80', sortOrder: 1 },
      { title: 'Weekend pantry edit', subtitle: 'Save on gourmet essentials', image: 'https://images.unsplash.com/photo-1606787366850-de6330128bfc?auto=format&fit=crop&w=1200&q=80', sortOrder: 2 },
    ],
  });

  const demoProduct = await prisma.product.findFirstOrThrow();
  await prisma.order.upsert({
    where: { orderId: 'FMXDEMO01' },
    update: {},
    create: {
      orderId: 'FMXDEMO01',
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone || '+91 90000 00002',
      email: customer.email,
      address: JSON.stringify({ line1: 'Flat 1201, Premium Heights', city: 'Mumbai', state: 'Maharashtra', pincode: '400050' }),
      subtotal: 299,
      discount: 30,
      deliveryFee: 39,
      tax: 13,
      total: 321,
      couponCode: 'FRESH10',
      paymentMethod: 'DEMO_ONLINE',
      paymentStatus: 'Paid',
      orderStatus: 'Delivered',
      estimatedDeliveryTime: new Date(),
      items: { create: { productId: demoProduct.id, name: demoProduct.name, image: firstImage(demoProduct.images), unit: demoProduct.unit, quantity: 1, price: demoProduct.sellingPrice, total: demoProduct.sellingPrice } },
      payment: { create: { method: 'DEMO_ONLINE', status: 'Paid', amount: 321, providerPaymentId: 'demo_seed_payment' } },
    },
  });

  console.log('FreshMart Express seed complete', { admin: admin.email, customer: customer.email });
}

main().finally(async () => prisma.$disconnect());
