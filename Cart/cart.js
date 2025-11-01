// cart.js - jednotný modul správy košíku
(function () {
    const STORAGE_KEY = 'drive_cart';
    const LEGACY_STORAGE_KEY = 'cart';

    class CartManager {
        constructor() {
            // Default: používej databázi přes API (server mode)
            this.useLocalStorage = false;
            this.apiBase = '/api';
            this.currencyFormatter = new Intl.NumberFormat('cs-CZ', {
                style: 'currency',
                currency: 'CZK',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            });

            this.cart = [];
            this.serverState = { items: [], total_cents: 0, cart_id: null };
            this.miniCart = null;
            this.cartIcon = null;
            this.backdrop = null; // backdrop se již nepoužívá (bez zatemnění)

            this.handleDocumentClick = this.handleDocumentClick.bind(this);
            this.handleCartIconClick = this.handleCartIconClick.bind(this);
            this.handleAddToCartClick = this.handleAddToCartClick.bind(this);

            this.init();
        }

        init() {
            this.cart = this.loadCartFromStorage();
            this.cacheDom();
            this.bindGlobalEvents();
            this.updateCartDisplay();
            if (!this.useLocalStorage) {
                // Při server módu hned načti košík ze serveru
                this.fetchServerCart?.();
            }
            window.dispatchEvent(new Event('cartReady'));
        }

        cacheDom() {
            this.cartIcon = document.getElementById('cartIcon');
            this.miniCart = this.cartIcon?.querySelector('.mini-cart') || document.querySelector('.mini-cart');

            // Move mini-cart to <body> to avoid transform stacking issues from navbar containers
            if (this.miniCart && this.miniCart.parentElement !== document.body) {
                document.body.appendChild(this.miniCart);
            }

            // backdrop již nevytváříme ani nepoužíváme
        }

        bindGlobalEvents() {
            document.addEventListener('click', this.handleDocumentClick);
            document.addEventListener('click', this.handleAddToCartClick);

            if (this.cartIcon && this.miniCart) {
                this.cartIcon.addEventListener('click', this.handleCartIconClick);
            }

            window.addEventListener('storage', (event) => {
                if (event.key === STORAGE_KEY || event.key === LEGACY_STORAGE_KEY) {
                    this.cart = this.loadCartFromStorage();
                    this.updateCartDisplay();
                }
            });
        }

        handleDocumentClick(event) {
            if (!this.cartIcon || !this.miniCart) return;

            const clickedInsideMiniCart = this.miniCart.contains(event.target);
            const clickedIcon = this.cartIcon.contains(event.target);

            if (!clickedInsideMiniCart && !clickedIcon) {
                this.setMiniCartState(false);
            }
        }

        handleCartIconClick(event) {
            if (!this.miniCart) return;
            event.preventDefault();
            event.stopPropagation();
            const willOpen = !this.miniCart.classList.contains('active');
            this.setMiniCartState(willOpen);
        }

        handleAddToCartClick(event) {
            const button = event.target.closest('[data-add-to-cart]');
            if (!button) return;

            event.preventDefault();

            const product = {
                id: button.dataset.id,
                name: button.dataset.name,
                price: Number(button.dataset.price) || 0,
                image: button.dataset.image || null
            };

            const variant = button.dataset.variant || null;
            const quantity = Number(button.dataset.quantity || '1');

            if (!product.id || !product.name || !product.price) {
                console.warn('Chybí data produktu pro přidání do košíku.', button.dataset);
                return;
            }

            this.addToCart(product, quantity, variant);
        }

        setMiniCartState(isOpen) {
            if (!this.miniCart) return;

            if (isOpen) {
                if (!this.useLocalStorage) {
                    // refresh from server before showing
                    this.fetchServerCart?.();
                }
                this.updateMiniCart();
                this.miniCart.classList.add('active');
                document.body.classList.add('mini-cart-open');
                // žádný backdrop
            } else {
                this.miniCart.classList.remove('active');
                document.body.classList.remove('mini-cart-open');
                // žádný backdrop
            }
        }

        loadCartFromStorage() {
            if (!this.useLocalStorage) {
                // Server mode: stav drží server; lokální stav jen jako cache
                return this.cart || [];
            }

            const migrateLegacyCart = () => {
                const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
                if (!legacy) return [];
                try {
                    const parsed = JSON.parse(legacy);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
                    localStorage.removeItem(LEGACY_STORAGE_KEY);
                    return Array.isArray(parsed) ? parsed : [];
                } catch (error) {
                    console.warn('Nelze načíst původní košík:', error);
                    return [];
                }
            };

            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) {
                return migrateLegacyCart();
            }

            try {
                const parsed = JSON.parse(stored);
                return Array.isArray(parsed) ? parsed : [];
            } catch (error) {
                console.warn('Nelze načíst košík:', error);
                return [];
            }
        }

        saveCart() {
            if (!this.useLocalStorage) return; // server mode: persistence on backend
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cart));
        }

        formatPrice(value) {
            return this.currencyFormatter.format(Math.max(0, Number(value) || 0));
        }

        findItem(productId, variant = null) {
            return this.cart.find(item => item.id === productId && (item.variant || null) === (variant || null));
        }

        async addToCart(product, quantity = 1, variant = null) {
            const safeQuantity = Math.max(1, Number(quantity) || 1);
            if (this.useLocalStorage) {
                const existingItem = this.findItem(product.id, variant);
                if (existingItem) {
                    existingItem.quantity += safeQuantity;
                } else {
                    this.cart.push({
                        id: product.id,
                        name: product.name,
                        price: Number(product.price) || 0,
                        quantity: safeQuantity,
                        variant: variant || null,
                        image: product.image || null,
                        addedAt: new Date().toISOString()
                    });
                }
                this.persistAndRefresh();
                this.showToast('Produkt byl přidán do košíku');
                return;
            }

            // Server mode: resolve numeric product id (slug/id supported), then POST
            try {
                const idOrSlug = encodeURIComponent(product.id);
                const resProd = await fetch(`${this.apiBase}/products/${idOrSlug}`);
                const prod = await resProd.json();
                if (!resProd.ok || !prod?.id) throw new Error('Produkt nenalezen');

                const res = await fetch(`${this.apiBase}/cart`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productId: prod.id, quantity: safeQuantity })
                });
                if (!res.ok) throw new Error('Nelze přidat do košíku');
                const payload = await res.json();
                this.syncFromServer(payload);
                this.showToast('Produkt byl přidán do košíku');
            } catch (e) {
                console.warn(e);
            }
        }

        async removeFromCart(productId, variant = null) {
            const wasOpen = this.miniCart?.classList.contains('active');
            if (this.useLocalStorage) {
                this.cart = this.cart.filter(item => !(item.id === productId && (item.variant || null) === (variant || null)));
                this.persistAndRefresh();
                if (wasOpen) this.setMiniCartState(true);
                return;
            }
            const target = this.cart.find(i => i.id === productId && (i.variant || null) === (variant || null));
            const itemId = target?._itemId;
            if (!itemId) return;
            try {
                const res = await fetch(`${this.apiBase}/cart/${itemId}`, { method: 'DELETE' });
                const payload = await res.json();
                this.syncFromServer(payload);
                if (wasOpen) this.setMiniCartState(true);
            } catch (e) { console.warn(e); }
        }

        async updateQuantity(productId, variant = null, newQuantity) {
            const item = this.findItem(productId, variant);
            if (!item) return;

            const normalizedQuantity = Number(newQuantity);
            if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
                await this.removeFromCart(productId, variant);
                return;
            }

            const wasOpen = this.miniCart?.classList.contains('active');
            if (this.useLocalStorage) {
                item.quantity = Math.min(99, normalizedQuantity);
                this.persistAndRefresh();
                if (wasOpen) this.setMiniCartState(true);
                return;
            }
            const itemId = item._itemId;
            if (!itemId) return;
            try {
                const res = await fetch(`${this.apiBase}/cart`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itemId, quantity: Math.min(99, normalizedQuantity) })
                });
                const payload = await res.json();
                this.syncFromServer(payload);
                if (wasOpen) this.setMiniCartState(true);
            } catch (e) { console.warn(e); }
        }

        changeQuantity(productId, variant = null, delta = 1) {
            const item = this.findItem(productId, variant);
            if (!item) return;
            this.updateQuantity(productId, variant, item.quantity + delta);
        }

        async clearCart() {
            if (this.useLocalStorage) {
                this.cart = [];
                this.persistAndRefresh();
                this.setMiniCartState(false);
                return;
            }
            try {
                const res = await fetch(`${this.apiBase}/checkout`, { method: 'POST' });
                const payload = await res.json();
                this.syncFromServer(payload);
                this.setMiniCartState(false);
            } catch (e) { console.warn(e); }
        }

        getTotalItems() {
            return this.cart.reduce((sum, item) => sum + item.quantity, 0);
        }

        getSubtotal() {
            return this.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        }

        persistAndRefresh() {
            this.saveCart();
            this.updateCartDisplay();
        }

        updateCartDisplay() {
            this.updateCartCount();
            this.updateMiniCart();
            this.updateCartPage();
            this.dispatchCartUpdate();
        }

        updateCartCount() {
            const totalItems = this.getTotalItems();
            document.querySelectorAll('.cart-count').forEach(el => {
                if (!el) return;
                el.textContent = totalItems > 9 ? '9+' : totalItems;
                el.style.display = totalItems > 0 ? 'flex' : 'none';
            });
        }

        updateMiniCart() {
            if (!this.miniCart) return;

            const miniCartItems = this.miniCart.querySelector('.mini-cart-items');
            const miniCartTotal = this.miniCart.querySelector('#miniCartTotal');
            if (!miniCartItems) return;

            miniCartItems.innerHTML = '';

            if (this.cart.length === 0) {
                miniCartItems.innerHTML = `
                    <div class="empty-cart-message">
                        <i class="fas fa-face-sad-tear"></i>
                        <p>Váš košík je prázdný.</p>
                    </div>
                `;
                if (miniCartTotal) miniCartTotal.textContent = this.formatPrice(0);
                // Nezavírej automaticky prázdný košík – umožni zobrazit prázdnou zprávu
                return;
            }

            let subtotal = 0;
            this.cart.forEach(item => {
                const itemTotal = item.price * item.quantity;
                subtotal += itemTotal;

                const row = document.createElement('div');
                row.className = 'mini-cart-item';
                row.innerHTML = `
                    <div>
                        <strong>${item.name}</strong>
                        ${item.variant ? `<div class="mini-cart-variant">${item.variant}</div>` : ''}
                        <div class="mini-cart-meta">${item.quantity} × ${this.formatPrice(item.price)}</div>
                    </div>
                    <button class="btn-remove" type="button" aria-label="Odebrat">
                        <i class="fas fa-trash"></i>
                    </button>
                `;

                row.querySelector('.btn-remove').addEventListener('click', () => {
                    this.removeFromCart(item.id, item.variant || null);
                });

                miniCartItems.appendChild(row);
            });

            if (miniCartTotal) miniCartTotal.textContent = this.formatPrice(subtotal);
        }

        updateCartPage() {
            const container = document.getElementById('cartItems');
            if (!container) return;

            const cartSubtotalEl = document.getElementById('cartSubtotal');
            const cartTotalEl = document.getElementById('cartTotal');
            const checkoutTotalEl = document.getElementById('checkoutTotal');
            const productsLink = window.location.pathname.includes('/Cart/') ? '../Products/index.html' : 'Products/index.html';

            container.innerHTML = '';

            if (this.cart.length === 0) {
                container.innerHTML = `
                    <div class="empty-cart-message">
                        <i class="fas fa-shopping-cart"></i>
                        <h3>Váš košík je prázdný</h3>
                        <p>Přidejte do něj první produkty.</p>
                        <a href="${productsLink}" class="btn">Prohlédnout produkty</a>
                    </div>
                `;
                if (cartSubtotalEl) cartSubtotalEl.textContent = this.formatPrice(0);
                if (cartTotalEl) cartTotalEl.textContent = this.formatPrice(0);
                if (checkoutTotalEl) checkoutTotalEl.textContent = this.formatPrice(0);
                return;
            }

            let subtotal = 0;
            this.cart.forEach(item => {
                const itemTotal = item.price * item.quantity;
                subtotal += itemTotal;

                const row = document.createElement('div');
                row.className = 'cart-item';
                row.innerHTML = `
                    <div class="cart-item-info">
                        <h4>${item.name}</h4>
                        ${item.variant ? `<p class="cart-item-variant">Příchuť: ${item.variant}</p>` : ''}
                    </div>
                    <div class="cart-item-actions">
                        <div class="quantity-selector">
                            <button class="quantity-btn" type="button">-</button>
                            <span class="quantity-value">${item.quantity}</span>
                            <button class="quantity-btn" type="button">+</button>
                        </div>
                        <div class="cart-item-price">${this.formatPrice(itemTotal)}</div>
                        <button class="remove-btn" type="button" aria-label="Odebrat">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;

                const [decreaseBtn, , increaseBtn] = row.querySelectorAll('.quantity-btn');
                decreaseBtn.addEventListener('click', () => this.changeQuantity(item.id, item.variant, -1));
                increaseBtn.addEventListener('click', () => this.changeQuantity(item.id, item.variant, 1));
                row.querySelector('.remove-btn').addEventListener('click', () => this.removeFromCart(item.id, item.variant));

                container.appendChild(row);
            });

            if (cartSubtotalEl) cartSubtotalEl.textContent = this.formatPrice(subtotal);
            if (cartTotalEl) cartTotalEl.textContent = this.formatPrice(subtotal);
            if (checkoutTotalEl) checkoutTotalEl.textContent = this.formatPrice(subtotal);
        }

        dispatchCartUpdate() {
            window.dispatchEvent(new CustomEvent('cartUpdated', {
                detail: {
                    cart: this.cart,
                    subtotal: this.getSubtotal(),
                    totalItems: this.getTotalItems()
                }
            }));
        }

        showToast(message) {
            if (!message) return;

            let toast = document.getElementById('global-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'global-toast';
                toast.className = 'toast';
                document.body.appendChild(toast);
            }

            toast.innerHTML = `
                <i class="fas fa-check-circle"></i>
                <span>${message}</span>
            `;

            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2600);
        }

        // Sync helpers for server mode
        syncFromServer(payload) {
            // payload: { items:[{id,quantity,product_id,slug,name,price_cents,image,hover_image}], total_cents }
            this.serverState = {
                items: Array.isArray(payload.items) ? payload.items : [],
                total_cents: Number(payload.total_cents || 0),
                cart_id: payload.cart_id || null,
            };
            // Map to local display structure; keep _itemId for ops
            this.cart = this.serverState.items.map(it => ({
                id: (it.slug || String(it.product_id)),
                name: it.name,
                price: Math.round((Number(it.price_cents) || 0) / 100),
                quantity: Number(it.quantity) || 1,
                variant: null,
                image: it.image || null,
                _itemId: it.id,
            }));
            this.updateCartDisplay();
        }

        async fetchServerCart() {
            try {
                const res = await fetch(`${this.apiBase}/cart`, { credentials: 'same-origin' });
                const payload = await res.json();
                this.syncFromServer(payload);
            } catch (e) {
                console.warn('Načtení košíku selhalo', e);
            }
        }

        enableServerMode(apiBase) {
            this.useLocalStorage = false;
            this.apiBase = apiBase || this.apiBase;
            this.fetchServerCart();
        }
    }

    window.cartManager = new CartManager();
})();