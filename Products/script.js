document.addEventListener('DOMContentLoaded', () => {
    // Databáze produktů
    const products = [
        { id: '1', name: 'Citrónová energie', price: 89, image: '🍋', description: 'Osvěžující citrónová příchuť s vyváženým obsahem kofeinu.', category: 'energy', badge: '' },
        { id: '2', name: 'Lesní ovoce', price: 79, image: '🍓', description: 'Sladká chuť lesního ovoce s jemným osvěžením.', category: 'hydratation', badge: 'NOVINKA' },
        { id: '3', name: 'Mátová svěžest', price: 85, image: '🍃', description: 'Svěží mátová příchuť, která povzbudí vaše smysly.', category: 'fresh', badge: '' },
        { id: '4', name: 'Limetkový restart', price: 95, image: '🍏', description: 'Kombinace limetky a zeleného jablka pro osvěžení.', category: 'fresh', badge: '' },
        { id: '5', name: 'Borůvková exploze', price: 99, image: '🫐', description: 'Intenzivní chuť borůvek s vysokým obsahem kofeinu.', category: 'energy', badge: '' },
        { id: '6', name: 'Pomerančový náboj', price: 87, image: '🍊', description: 'Sladkokyselá pomerančová příchuť pro každodenní použití.', category: 'fresh', badge: '' },
        { id: '7', name: 'Tropická směs', price: 92, image: '🍍', description: 'Exotická kombinace manga, ananasu a maracuji.', category: 'tropical', badge: '' },
        { id: '8', name: 'Jablečná svěžest', price: 83, image: '🍎', description: 'Křupavá chuť zeleného jablka s jemným nádechem skořice.', category: 'fresh', badge: '' }
    ];

    // Košík
    const hasCartManager = typeof window.cartManager !== 'undefined';
    if (hasCartManager) {
        try { window.cartManager.enableServerMode('/api'); } catch {}
    }
    let cart = hasCartManager ? [] : JSON.parse(localStorage.getItem('cart')) || [];

    // Navigace
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('navMenu');

    if (hamburger) {
        hamburger.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            hamburger.classList.toggle('active');
        });
    }

    // Aktualizace počtu položek v košíku
    function updateCartCount() {
        if (hasCartManager) return;
        const cartCount = document.getElementById('cartCount');
        if (cartCount) {
            const count = cart.reduce((sum, item) => sum + item.quantity, 0);
            cartCount.textContent = count > 9 ? '9+' : count;
            cartCount.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    // Renderování produktů
    function renderProducts(category = 'all') {
        const productsGrid = document.getElementById('productsGrid');
        if (!productsGrid) return;

        productsGrid.innerHTML = '';

        const filteredProducts = category === 'all'
            ? products
            : products.filter(product => product.category === category);

        if (filteredProducts.length === 0) {
            productsGrid.innerHTML = '<p class="text-center" style="grid-column: 1/-1; padding: 2rem;">Žádné produkty v této kategorii.</p>';
            return;
        }

        filteredProducts.forEach(product => {
            const productCard = document.createElement('div');
            productCard.className = 'product-card';
            productCard.innerHTML = `
                ${product.badge ? `<span class="product-badge">${product.badge}</span>` : ''}
                <div class="product-image">
                    <span>${product.image}</span>
                </div>
                <div class="product-info">
                    <h3 class="product-title">${product.name}</h3>
                    <div class="product-price">${product.price} Kč</div>
                    <p class="product-description">${product.description}</p>
                    <button
                        class="add-to-cart"
                        data-add-to-cart="true"
                        data-id="${product.id}"
                        data-name="${product.name}"
                        data-price="${product.price}"
                        data-quantity="1"
                    >
                        Přidat do košíku
                    </button>
                </div>
            `;
            productsGrid.appendChild(productCard);
        });

        // Animace produktových karet
        const productCards = document.querySelectorAll('.product-card');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animated');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        productCards.forEach(card => {
            observer.observe(card);
        });
    }

    // Přidání do košíku
    function addToCart(productId) {
        const productToAdd = products.find(p => p.id === productId);
        if (!productToAdd) return;

        if (hasCartManager) {
            window.cartManager.addToCart(
                {
                    id: productToAdd.id,
                    name: productToAdd.name,
                    price: Number(productToAdd.price) || 0,
                    image: null
                },
                1
            );
            return;
        }

        const existingItem = cart.find(item => item.id === productId);
        if (existingItem) {
            existingItem.quantity++;
        } else {
            cart.push({ ...productToAdd, quantity: 1 });
        }
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartCount();

        // Zobrazit potvrzení
        showNotification('Produkt byl přidán do košíku');
    }

    // Filtrování podle kategorie
    function setupCategoryFilters() {
        const categoryBtns = document.querySelectorAll('.category-btn');

        categoryBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Odstranit aktivní třídu ze všech tlačítek
                categoryBtns.forEach(b => b.classList.remove('active'));
                // Přidat aktivní třídu na kliknuté tlačítko
                btn.classList.add('active');

                // Filtrovat produkty
                const category = btn.dataset.category;
                renderProducts(category);
            });
        });
    }

    // Zobrazení notifikace
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: var(--text-primary);
            color: white;
            padding: 1rem 1.5rem;
            z-index: 10000;
            transform: translateX(150%);
            transition: transform 0.3s ease;
            font-size: 0.9rem;
            font-weight: 300;
            border-radius: var(--radius);
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        setTimeout(() => {
            notification.style.transform = 'translateX(150%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // Inicializace
    updateCartCount();
    renderProducts();
    setupCategoryFilters();

    // Event listenery
    if (!hasCartManager) {
        document.addEventListener('click', (e) => {
            if (e.target.closest('.add-to-cart')) {
                const productId = e.target.closest('.add-to-cart').dataset.id;
                addToCart(productId);
            }
        });
    }

    // Newsletter
    const newsletterForm = document.querySelector('.newsletter-form');
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showNotification('Děkujeme za přihlášení k odběru newsletteru!');
            newsletterForm.reset();
        });
    }
});