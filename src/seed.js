const { db } = require('./db');

function seedProducts() {
  const insert = db.prepare(`INSERT INTO products (slug, name, price_cents, image, hover_image, description, features)
    VALUES (@slug, @name, @price_cents, @image, @hover_image, @description, @features)`);

  // Only insert CANS products if missing
  const mustHaveSlugs = ['cans-mango', 'cans-citrus', 'cans-berry'];
  const existing = db.prepare('SELECT slug FROM products WHERE slug IN (?, ?, ?)').all(...mustHaveSlugs).map(r => r.slug);
  const missing = mustHaveSlugs.filter(slug => !existing.includes(slug));

  const products = [
    {
      slug: 'cans-mango',
      name: 'CANS Mango — 24 × 330ml',
      price_cents: 59900,
      image: '/Products/test.png',
      hover_image: '/Products/test2.jpg',
      description: 'Osvěžující mango příchuť. Přírodní kofein z guarany, vitamíny B, bez přidaného cukru.',
      features: JSON.stringify(['Přírodní kofein', 'Bez cukru', 'Vegan', 'Recyklovatelná plechovka'])
    },
    {
      slug: 'cans-citrus',
      name: 'CANS Citrus — 24 × 330ml',
      price_cents: 59900,
      image: '/Products/test.png',
      hover_image: '/Products/test2.jpg',
      description: 'Energizující citrusová příchuť. Přírodní kofein, vitamíny, bez cukru.',
      features: JSON.stringify(['Citrus', 'Bez cukru', 'Vegan', 'Recyklovatelná plechovka'])
    },
    {
      slug: 'cans-berry',
      name: 'CANS Berry — 24 × 330ml',
      price_cents: 59900,
      image: '/Products/test.png',
      hover_image: '/Products/test2.jpg',
      description: 'Lahodná lesní směs. Přírodní kofein, vitamíny, bez cukru.',
      features: JSON.stringify(['Lesní ovoce', 'Bez cukru', 'Vegan', 'Recyklovatelná plechovka'])
    },
    // původní testovací produkty (ponechány pro jistotu)
    {
      slug: 'test-bottle',
      name: 'Test Bottle',
      price_cents: 2990,
      image: '/Products/test.png',
      hover_image: '/Products/test2.jpg',
      description: 'Stylová láhev na vodu pro každý den.',
      features: JSON.stringify(['BPA-free', '0.75l', 'Lehká a odolná'])
    },
    {
      slug: 'voda',
      name: 'Voda',
      price_cents: 1990,
      image: '/Products/voda.png',
      hover_image: '/Products/test2.jpg',
      description: 'Osvěžující voda pro hydrataci.',
      features: JSON.stringify(['Přírodní', 'Bez cukru', 'Recyklovatelný obal'])
    },
    {
      slug: 'drive-starter-pack',
      name: 'DRIVE Starter Pack',
      price_cents: 99900,
      image: '/Products/test.png',
      hover_image: '/Products/test2.jpg',
      description: 'Startovní balíček DRIVE pro první objednávku.',
      features: JSON.stringify(['Starter pack', 'Limitovaná edice'])
    },
  ];

  let seeded = false;
  if (missing.length > 0) {
    const toInsert = products.filter(p => missing.includes(p.slug));
    const transaction = db.transaction((rows) => {
      for (const row of rows) insert.run(row);
    });
    transaction(toInsert);
    seeded = true;
  }
  const count = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  return { seeded, count };
}

module.exports = { seedProducts };
