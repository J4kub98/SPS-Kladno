document.addEventListener('DOMContentLoaded', () => {
    let products = [];
    let cart = JSON.parse(localStorage.getItem('cart')) || [];

    const hasCartManager = typeof window.cartManager !== 'undefined';
    // Enable server-backed cart so košík je sdílen napříč stránkami a uložen v DB
    if (hasCartManager) {
        try { window.cartManager.enableServerMode('/api'); } catch {}
    }

    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('navMenu');

    if (hamburger) {
        hamburger.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            hamburger.classList.toggle('active');
        });
    }

    const pages = document.querySelectorAll('.page');
    const navLinks = document.querySelectorAll('.nav-link');

    function showPage(pageId) {
        pages.forEach(page => {
            page.classList.toggle('active', page.id === pageId);
        });
        navLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.page === pageId);
        });
        if (hamburger.classList.contains('active')) hamburger.click();
    }

    showPage('home');
    updateCartCount();

    const miniCart = document.querySelector('.mini-cart');
    const miniCartItems = miniCart ? miniCart.querySelector('.mini-cart-items') : null;
    const cartIcon = document.getElementById('cartIcon');

    if (!hasCartManager && cartIcon && miniCart) {
        cartIcon.addEventListener('click', e => {
            e.stopPropagation();
            miniCart.classList.toggle('active');
            renderMiniCart();
        });
    }

    if (!hasCartManager) {
        document.body.addEventListener('click', e => {
            const clickOnCartIcon = cartIcon ? cartIcon.contains(e.target) : false;
            if (miniCart && miniCart.classList.contains('active') && !miniCart.contains(e.target) && !clickOnCartIcon) {
                miniCart.classList.remove('active');
            }
        });
    }

    const pageLinks = document.querySelectorAll('[data-page]');
    pageLinks.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            showPage(link.dataset.page);
        });
    });

    function updateCartCount() {
        if (hasCartManager) return;
        const cartCount = document.getElementById('cartCount');
        if (cartCount) {
            const count = cart.reduce((sum, item) => sum + item.quantity, 0);
            cartCount.textContent = count > 9 ? '9+' : count;
            cartCount.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    // ------------------------
    // FETCH PRODUCTS FROM API
    // ------------------------
    async function fetchProducts() {
        try {
            const res = await fetch("http://127.0.0.1:5000/products");
            const data = await res.json();
            products = data.map(p => ({
                id: p.id.toString(),
                name: p.nazev,
                price: p.cena,
                image: p.obrazek,
                description: p.popis,
                category: '',
                flavor: '',
                caffeine: '',
                badge: ''
            }));
            renderProducts();
        } catch (error) {
            console.error("Chyba při načítání produktů:", error);
        }
    }

    async function fetchProductById(productId) {
        const res = await fetch(`http://127.0.0.1:5000/product/${productId}`);
        const p = await res.json();
        return {
            id: p.id.toString(),
            name: p.nazev,
            price: p.cena,
            image: p.obrazek,
            description: p.popis,
            category: '',
            flavor: '',
            caffeine: '',
            badge: ''
        };
    }

    // ------------------------
    // RENDER PRODUCTS
    // ------------------------
    function renderProducts() {
        const productsGrid = document.getElementById('productsGrid');
        if (!productsGrid) return;
        productsGrid.innerHTML = '';

        products.forEach(product => {
            const productCard = document.createElement('div');
            productCard.className = 'product-card';
            productCard.innerHTML = `
                ${product.badge ? `<span class="product-badge">${product.badge}</span>` : ''}
                <div class="product-image">
                    <span>${product.image}</span>
                </div>
                <div class="product-info">
                    <h3 class="product-title">${product.name}</h3>
                    <p class="product-price">${product.price} Kč</p>
                    <button class="add-to-cart btn" data-id="${product.id}">
                        <i class="fas fa-shopping-cart"></i> Přidat do košíku
                    </button>
                </div>
            `;
            productsGrid.appendChild(productCard);
        });

        // Animace produktových karet
        const productCards = document.querySelectorAll('.products-grid .product-card');
        const productObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animated');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.2 });

        productCards.forEach(card => productObserver.observe(card));
    }

    // ------------------------
    // MINI CART
    // ------------------------
    function renderMiniCart() {
        if (hasCartManager) return;
        const miniCartTotal = document.getElementById('miniCartTotal');
        if (!miniCartItems || !miniCartTotal) return;

        miniCartItems.innerHTML = '';
        if (cart.length === 0) {
            miniCartItems.innerHTML = '<p class="text-center">Váš košík je prázdný.</p>';
            miniCartTotal.textContent = '0 Kč';
            return;
        }

        let total = 0;
        cart.forEach(item => {
            const itemPrice = item.price * item.quantity;
            total += itemPrice;

            const itemElement = document.createElement('div');
            itemElement.className = 'mini-cart-item';
            itemElement.innerHTML = `<span>${item.name} (${item.quantity}x)</span><span>${itemPrice} Kč</span>`;
            miniCartItems.appendChild(itemElement);
        });
        miniCartTotal.textContent = `${total} Kč`;
    }

    // ------------------------
    // ADD TO CART
    // ------------------------
    async function addToCart(productId) {
        const productFromList = products.find(p => p.id === productId);
        const productToAdd = productFromList || await fetchProductById(productId);
        if (!productToAdd) return;

        if (hasCartManager) {
            window.cartManager.addToCart(
                {
                    id: productToAdd.id,
                    name: productToAdd.name,
                    price: Number(productToAdd.price) || 0,
                    image: productToAdd.image || null
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
        renderMiniCart();
        alert('Produkt byl přidán do košíku!');
    }

    document.addEventListener('click', e => {
        if (e.target.closest('.add-to-cart')) {
            const productId = e.target.closest('.add-to-cart').dataset.id;
            addToCart(productId);
        }

        if (hasCartManager) {
            return;
        }

        // Increase/decrease/remove v plném košíku
        if (e.target.closest('.increase')) {
            const id = e.target.closest('.increase').dataset.id;
            const item = cart.find(i => i.id === id);
            if (item) { item.quantity++; localStorage.setItem('cart', JSON.stringify(cart)); updateCartCount(); updateCartDisplay(); }
        }
        if (e.target.closest('.decrease')) {
            const id = e.target.closest('.decrease').dataset.id;
            const item = cart.find(i => i.id === id);
            if (item && item.quantity > 1) { item.quantity--; localStorage.setItem('cart', JSON.stringify(cart)); updateCartCount(); updateCartDisplay(); }
        }
        if (e.target.closest('.remove-btn')) {
            const id = e.target.closest('.remove-btn').dataset.id;
            cart = cart.filter(i => i.id !== id);
            localStorage.setItem('cart', JSON.stringify(cart));
            updateCartCount();
            updateCartDisplay();
        }
    });

    // ------------------------
    // FULL CART RENDER
    // ------------------------
    function updateCartDisplay() {
        if (hasCartManager) return;
        const cartItemsContainer = document.getElementById('cartItems');
        const checkoutTotal = document.getElementById('checkoutTotal');
        const cartSummarySubtotal = document.getElementById('cartSummarySubtotal');
        const cartSummaryShipping = document.getElementById('cartSummaryShipping');
        const cartSummaryTotal = document.getElementById('cartSummaryTotal');

        if (!cartItemsContainer) return;

        cartItemsContainer.innerHTML = '';
        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<p class="text-center">Váš košík je prázdný.</p>';
            if (cartSummarySubtotal) cartSummarySubtotal.textContent = '0 Kč';
            if (cartSummaryShipping) cartSummaryShipping.textContent = '0 Kč';
            if (cartSummaryTotal) cartSummaryTotal.textContent = '0 Kč';
            if (checkoutTotal) checkoutTotal.textContent = '0 Kč';
            return;
        }

        let subtotal = 0;
        cart.forEach(item => {
            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;
            const itemElement = document.createElement('div');
            itemElement.className = 'cart-item';
            itemElement.innerHTML = `
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    <p>Cena: ${item.price} Kč</p>
                </div>
                <div class="cart-item-actions">
                    <div class="quantity-selector">
                        <button class="quantity-btn decrease" data-id="${item.id}">-</button>
                        <span>${item.quantity}</span>
                        <button class="quantity-btn increase" data-id="${item.id}">+</button>
                    </div>
                    <span class="cart-item-price">${itemTotal} Kč</span>
                    <button class="remove-btn" data-id="${item.id}"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
            cartItemsContainer.appendChild(itemElement);
        });

        if (cartSummarySubtotal) cartSummarySubtotal.textContent = `${subtotal} Kč`;
        const shipping = subtotal > 500 ? 0 : 79;
        if (cartSummaryShipping) cartSummaryShipping.textContent = `${shipping} Kč`;
        const total = subtotal + shipping;
        if (cartSummaryTotal) cartSummaryTotal.textContent = `${total} Kč`;
        if (checkoutTotal) checkoutTotal.textContent = `${total} Kč`;
    }

    // ------------------------
    // CHECKOUT
    // ------------------------
    const checkoutForm = document.getElementById('checkoutForm');
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', async e => {
            e.preventDefault();
            if (hasCartManager) {
                try {
                    await fetch('/api/checkout', { method: 'POST' });
                    if (window.cartManager) await window.cartManager.fetchServerCart();
                } catch {}
            } else {
                cart = [];
                localStorage.setItem('cart', JSON.stringify(cart));
                updateCartCount();
            }
            alert('Objednávka byla úspěšně odeslána!');
            showPage('home');
        });
    }

    // ------------------------
    // NEWSLETTER
    // ------------------------
    const newsletterForms = document.querySelectorAll('.newsletter-form');
    newsletterForms.forEach(form => {
        form.addEventListener('submit', e => {
            e.preventDefault();
            alert('Děkujeme za přihlášení k odběru newsletteru!');
            form.reset();
        });
    });

    // ------------------------
    // ANIMACE BENEFITŮ
    // ------------------------
    const benefitCards = document.querySelectorAll('.benefit-card');
    const benefitObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
                benefitObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });

    benefitCards.forEach(card => benefitObserver.observe(card));

    // ------------------------
    // INITIAL LOAD
    // ------------------------
    fetchProducts();
    if (window.location.hash.substring(1) === 'cart') updateCartDisplay();
});

function fetchProducts() {
    fetch('http://localhost:5000/api/products')
        .then(res => res.json())
        .then(products => {
            const container = document.getElementById('products');
            container.innerHTML = '';
            products.forEach(product => {
                const div = document.createElement('div');
                div.className = 'product';
                div.innerHTML = `
                    <strong>${product.nazev}</strong><br>
                    Cena: ${product.cena} Kč<br>
                    Skladem: <span id="stock-${product.id}">${product.pocet_ks > 0 ? 'skladem' : 'není skladem'} (${product.pocet_ks})</span><br>
                    <input type="number" id="qty-${product.id}" min="1" max="${product.pocet_ks}" value="1" ${product.pocet_ks === 0 ? 'disabled' : ''}>
                    <button onclick="orderProduct(${product.id}, ${product.pocet_ks})" ${product.pocet_ks === 0 ? 'disabled' : ''}>Objednat</button>
                `;
                container.appendChild(div);
            });
        });
}

function orderProduct(id, maxQty) {
    const qty = parseInt(document.getElementById(`qty-${id}`).value, 10);
    if (!qty || qty < 1 || qty > maxQty) return;
    fetch('http://localhost:5000/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: id, quantity: qty })
    })
    .then(res => res.json())
    .then(result => {
        const resultDiv = document.getElementById('order-result');
        if (result.success) {
            resultDiv.textContent = 'Objednávka úspěšná!';
            fetchProducts();
        } else {
            resultDiv.textContent = result.error || 'Chyba při objednávce.';
        }
    });
}
