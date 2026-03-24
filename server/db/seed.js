require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const products = [
  { sku:'GL-CYL-06',  name:'Clear Cylinder Vase 6"',    category:'glass',     category_label:'Glass Vases',   price:2.49,   original_price:7.99,   min_qty:12, unit:'ea',   badge:'BESTSELLER', badge_type:'badge-dark',    description:'Crystal-clear borosilicate glass cylinder. Perfect for centerpieces, table arrangements, and floral installations. Consistent sizing makes batching easy.',    gradient:'linear-gradient(135deg,#e0f2fe,#bae6fd)', icon:'🏺', in_stock:1, sort_order:1  },
  { sku:'GL-CYL-12',  name:'Clear Cylinder Vase 12"',   category:'glass',     category_label:'Glass Vases',   price:3.99,   original_price:12.99,  min_qty:12, unit:'ea',   badge:'SALE',       badge_type:'badge-red',     description:'Tall clear cylinder for dramatic floral displays. Ideal for tall bouquets, branches, and statement centerpieces.',                                              gradient:'linear-gradient(135deg,#dbeafe,#bfdbfe)', icon:'🏺', in_stock:1, sort_order:2  },
  { sku:'GL-BUD-S3',  name:'Glass Bud Vase Set',         category:'glass',     category_label:'Glass Vases',   price:8.99,   original_price:24.99,  min_qty:6,  unit:'set',  badge:'-64%',       badge_type:'badge-red',     description:'Set of 3 mismatched bud vases. Popular for rustic weddings, reception tables, and DIY home styling.',                                                          gradient:'linear-gradient(135deg,#f0fdf4,#dcfce7)', icon:'🏺', in_stock:1, sort_order:3  },
  { sku:'GL-FISH-08', name:'Fishbowl Vase 8"',           category:'glass',     category_label:'Glass Vases',   price:4.49,   original_price:13.99,  min_qty:6,  unit:'ea',   badge:null,         badge_type:null,            description:'Classic fishbowl shape. Great for floating arrangements, submerged flowers, and tropical themes.',                                                             gradient:'linear-gradient(135deg,#ecfeff,#cffafe)', icon:'🐟', in_stock:1, sort_order:4  },
  { sku:'CE-WHT-08',  name:'White Matte Cylinder 8"',    category:'ceramic',   category_label:'Ceramic',       price:5.99,   original_price:16.99,  min_qty:6,  unit:'ea',   badge:'POPULAR',    badge_type:'badge-primary', description:'Modern matte white ceramic. Versatile for any event style from minimalist to romantic.',                                                                      gradient:'linear-gradient(135deg,#f8fafc,#f1f5f9)', icon:'🪴', in_stock:1, sort_order:5  },
  { sku:'CE-TERRA',   name:'Rustic Terracotta Pot',       category:'ceramic',   category_label:'Ceramic',       price:3.49,   original_price:9.99,   min_qty:12, unit:'ea',   badge:null,         badge_type:null,            description:'Authentic terracotta with natural earthy tones. Perfect for boho, garden, and outdoor events.',                                                              gradient:'linear-gradient(135deg,#fff7ed,#fed7aa)', icon:'🪴', in_stock:1, sort_order:6  },
  { sku:'CE-URN-WH',  name:'Pearl White Urn Vase',        category:'ceramic',   category_label:'Ceramic',       price:7.99,   original_price:22.99,  min_qty:4,  unit:'ea',   badge:'PREMIUM',    badge_type:'badge-amber',   description:'Elegant urn silhouette with pearlescent glaze finish. Timeless luxury for weddings and high-end events.',                                                      gradient:'linear-gradient(135deg,#fefce8,#fef9c3)', icon:'🏺', in_stock:1, sort_order:7  },
  { sku:'CE-STONE',   name:'Speckled Stoneware Pot',      category:'ceramic',   category_label:'Ceramic',       price:6.49,   original_price:18.99,  min_qty:6,  unit:'ea',   badge:null,         badge_type:null,            description:'Hand-finished stoneware with natural speckled texture. Artisan look at wholesale prices.',                                                                      gradient:'linear-gradient(135deg,#f5f3ff,#ede9fe)', icon:'🪴', in_stock:1, sort_order:8  },
  { sku:'MT-GAL-SM',  name:'Galvanized Bucket Small',     category:'metal',     category_label:'Metal',         price:3.99,   original_price:10.99,  min_qty:12, unit:'ea',   badge:'TRENDING',   badge_type:'badge-green',   description:'Classic galvanized metal bucket. Rustic farmhouse style, great for country and outdoor weddings.',                                                            gradient:'linear-gradient(135deg,#f1f5f9,#e2e8f0)', icon:'🪣', in_stock:1, sort_order:9  },
  { sku:'MT-GAL-LG',  name:'Galvanized Bucket Large',     category:'metal',     category_label:'Metal',         price:5.49,   original_price:15.99,  min_qty:6,  unit:'ea',   badge:null,         badge_type:null,            description:'Large galvanized bucket for statement arrangements, buffet tables, and ceremony decor.',                                                                       gradient:'linear-gradient(135deg,#e2e8f0,#cbd5e1)', icon:'🪣', in_stock:1, sort_order:10 },
  { sku:'MT-RGEO',    name:'Rose Gold Geo Vase',           category:'metal',     category_label:'Metal',         price:6.99,   original_price:19.99,  min_qty:4,  unit:'ea',   badge:'NEW',        badge_type:'badge-primary', description:'Geometric faceted vase with rose gold electroplated finish. On-trend and perfect for modern romantic events.',                                              gradient:'linear-gradient(135deg,#fff1f2,#fecdd3)', icon:'💎', in_stock:1, sort_order:11 },
  { sku:'MT-BLK-CY',  name:'Black Matte Metal Cylinder',  category:'metal',     category_label:'Metal',         price:5.99,   original_price:16.99,  min_qty:6,  unit:'ea',   badge:null,         badge_type:null,            description:'Sleek matte black finish. Contemporary and bold. Pairs beautifully with white and greenery arrangements.',                                                      gradient:'linear-gradient(135deg,#1e293b,#334155)', icon:'🖤', in_stock:1, sort_order:12 },
  { sku:'BN-WED-50',  name:'Wedding Package 50pc',         category:'bundles',   category_label:'Bundles',       price:89.99,  original_price:249.99, min_qty:1,  unit:'set',  badge:'-64%',       badge_type:'badge-red',     description:'50-piece curated mix: cylinders, bud vases, geo accents. Everything for a complete wedding.',                                                                  gradient:'linear-gradient(135deg,#fdf4ff,#f5d0fe)', icon:'💍', in_stock:1, sort_order:13 },
  { sku:'BN-EVT-100', name:'Event Starter Kit 100pc',      category:'bundles',   category_label:'Bundles',       price:149.99, original_price:449.99, min_qty:1,  unit:'set',  badge:'BESTSELLER', badge_type:'badge-dark',    description:'100-piece professional event kit with variety of styles. The complete solution for event designers.',                                                         gradient:'linear-gradient(135deg,#f0fdf4,#bbf7d0)', icon:'📦', in_stock:1, sort_order:14 },
  { sku:'BN-FLO-30',  name:'Florist Mix Bundle 30pc',      category:'bundles',   category_label:'Bundles',       price:69.99,  original_price:189.99, min_qty:1,  unit:'set',  badge:'POPULAR',    badge_type:'badge-primary', description:'30-piece florist-curated bundle. Best everyday variety for flower shops and studios.',                                                                     gradient:'linear-gradient(135deg,#eff6ff,#bfdbfe)', icon:'💐', in_stock:1, sort_order:15 },
  { sku:'SP-FOAM-48', name:'Floral Foam Bricks 48pk',      category:'supplies',  category_label:'Supplies',      price:24.99,  original_price:59.99,  min_qty:2,  unit:'pack', badge:'SALE',       badge_type:'badge-red',     description:'Professional wet floral foam. 48 standard bricks per pack. Industry-standard for professional florists.',                                                    gradient:'linear-gradient(135deg,#f0fdf4,#dcfce7)', icon:'🧱', in_stock:1, sort_order:16 },
  { sku:'SP-LINER-20',name:'Waterproof Liner Set 20pk',    category:'supplies',  category_label:'Supplies',      price:12.99,  original_price:29.99,  min_qty:4,  unit:'pack', badge:null,         badge_type:null,            description:'Heavy-duty waterproof liners for any vase or container. Protect surfaces and extend floral life.',                                                           gradient:'linear-gradient(135deg,#ecfeff,#a5f3fc)', icon:'💧', in_stock:1, sort_order:17 },
  { sku:'SP-TERR-HG', name:'Hanging Glass Terrarium',      category:'specialty', category_label:'Specialty',     price:3.99,   original_price:11.99,  min_qty:12, unit:'ea',   badge:'TRENDING',   badge_type:'badge-green',   description:'Geometric hanging glass terrarium. Great for succulents, air plants, and decorative moss.',                                                                    gradient:'linear-gradient(135deg,#f0fdfa,#ccfbf1)', icon:'🌿', in_stock:1, sort_order:18 },
  { sku:'SP-WOOD-08', name:'Wooden Box Planter 8"',        category:'specialty', category_label:'Specialty',     price:8.99,   original_price:24.99,  min_qty:4,  unit:'ea',   badge:null,         badge_type:null,            description:'Reclaimed wood finish planter box with metal corner accents. Rustic warmth for any setting.',                                                                  gradient:'linear-gradient(135deg,#fefce8,#fef08a)', icon:'🪵', in_stock:1, sort_order:19 },
  { sku:'SP-MERC-07', name:'Mercury Glass Vase 7"',        category:'specialty', category_label:'Specialty',     price:5.49,   original_price:15.99,  min_qty:6,  unit:'ea',   badge:'NEW',        badge_type:'badge-primary', description:'Antique mercury glass finish. Vintage glamour for weddings, galas, and elegant events.',                                                                     gradient:'linear-gradient(135deg,#fdf4ff,#e9d5ff)', icon:'✨', in_stock:1, sort_order:20 },
];

const promoCodes = [
  { code:'BASELAB10', type:'percent', value:10, min_order:0,   max_uses:null },
  { code:'WELCOME10', type:'percent', value:10, min_order:0,   max_uses:1000 },
  { code:'SAVE10',    type:'percent', value:10, min_order:0,   max_uses:null },
  { code:'BULK20',    type:'percent', value:20, min_order:200, max_uses:null },
  { code:'FREESHIP',  type:'fixed',   value:14.99, min_order:0, max_uses:null },
];

function seed() {
  console.log('Seeding database...');

  const productCount = db.prepare('SELECT COUNT(*) as cnt FROM products').get().cnt;
  if (productCount === 0) {
    const insertProduct = db.prepare(`
      INSERT INTO products (sku, name, category, category_label, price, original_price, min_qty, unit, badge, badge_type, description, gradient, icon, in_stock, sort_order)
      VALUES (@sku, @name, @category, @category_label, @price, @original_price, @min_qty, @unit, @badge, @badge_type, @description, @gradient, @icon, @in_stock, @sort_order)
    `);

    const insertMany = db.transaction((items) => {
      for (const item of items) {
        insertProduct.run(item);
      }
    });

    insertMany(products);
    console.log(`Seeded ${products.length} products.`);
  } else {
    console.log(`Products already seeded (${productCount} found). Skipping.`);
  }

  const promoInsert = db.prepare(`
    INSERT OR IGNORE INTO promo_codes (code, type, value, min_order, max_uses)
    VALUES (@code, @type, @value, @min_order, @max_uses)
  `);
  const insertPromos = db.transaction((codes) => {
    for (const c of codes) {
      promoInsert.run(c);
    }
  });
  insertPromos(promoCodes);
  console.log('Promo codes seeded.');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@baselab.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const hashedPassword = bcrypt.hashSync(adminPassword, 12);
  const adminUuid = uuidv4();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (existing) {
    db.prepare('UPDATE users SET password = ?, role = ?, is_verified = 1, updated_at = datetime(\'now\') WHERE id = ?')
      .run(hashedPassword, 'admin', existing.id);
    console.log(`Admin user updated: ${adminEmail}`);
  } else {
    db.prepare(`
      INSERT INTO users (uuid, email, password, first_name, last_name, role, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(adminUuid, adminEmail, hashedPassword, 'Admin', 'User', 'admin', 1);
    console.log(`Admin user created: ${adminEmail}`);
  }

  console.log('Seed complete.');
}

seed();
