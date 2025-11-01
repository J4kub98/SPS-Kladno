const flavorData = {
    mango: {
        name: 'CANS Mango — 24 × 330ml',
        shortName: 'CANS Mango',
        description: 'Osvěžující mango příchuť',
        images: {
            main: '../Products/test.png',
            thumb1: '../Products/test.png',
            thumb2: '../Products/test2.jpg',
            mini: '../Products/test.png'
        },
        color: 'mango'
    },
    citrus: {
        name: 'CANS Citrus — 24 × 330ml',
        shortName: 'CANS Citrus',
        description: 'Energizující citrusová příchuť',
        images: {
            main: '../Products/test.png',
            thumb1: '../Products/test.png',
            thumb2: '../Products/test2.jpg',
            mini: '../Products/test.png'
        },
        color: 'citrus'
    },
    berry: {
        name: 'CANS Berry — 24 × 330ml',
        shortName: 'CANS Berry',
        description: 'Lahodná lesní směs',
        images: {
            main: '../Products/test.png',
            thumb1: '../Products/test.png',
            thumb2: '../Products/test2.jpg',
            mini: '../Products/test.png'
        },
        color: 'berry'
    }
};

const purchaseOptions = {
    single: {
        price: 599,
        label: 'Jednorázový nákup'
    },
    subscription: {
        price: 479,
        label: 'Předplatné'
    }
};

let currentFlavor = 'mango';
let currentPurchaseOption = 'single';
let currentQuantity = 1;

const getCartManager = () => window.cartManager;

function changeImage(source, element) {
    const mainImage = document.getElementById('main-product-image');
    if (!mainImage) return;

    mainImage.style.opacity = '0.7';
    mainImage.style.transform = 'scale(0.95)';

    setTimeout(() => {
        mainImage.src = source;
        mainImage.style.opacity = '1';
        mainImage.style.transform = 'scale(1)';
    }, 140);

    document.querySelectorAll('.thumbnail').forEach(thumb => {
        thumb.classList.remove('active');
    });

    if (element) {
        element.classList.add('active');
    }
}

function updateAddButtonState() {
    const addButton = document.getElementById('addToCartBtn');
    if (!addButton) return;

    const option = purchaseOptions[currentPurchaseOption];
    addButton.dataset.price = option.price;
    addButton.dataset.quantity = currentQuantity;
}

function selectFlavor(flavorKey, element) {
    const flavor = flavorData[flavorKey];
    if (!flavor) return;

    currentFlavor = flavorKey;

    const container = document.querySelector('.container');
    if (container) {
        container.className = `container ${flavor.color}`;
    }

    document.querySelectorAll('.flavor-option').forEach(option => {
        option.classList.remove('active');
    });
    if (element) {
        element.classList.add('active');
    }

    const titleEl = document.querySelector('.product-title h1');
    const descriptionEl = document.querySelector('.product-title .flavor');
    if (titleEl) titleEl.textContent = flavor.shortName;
    if (descriptionEl) descriptionEl.textContent = flavor.description;

    changeImage(flavor.images.main, null);

    const thumbnails = document.querySelectorAll('.thumbnail');
    if (thumbnails[0]) {
        thumbnails[0].querySelector('img').src = flavor.images.thumb1;
        thumbnails[0].onclick = function () {
            changeImage(flavor.images.thumb1, this);
        };
    }
    if (thumbnails[1]) {
        thumbnails[1].querySelector('img').src = flavor.images.thumb2;
        thumbnails[1].onclick = function () {
            changeImage(flavor.images.thumb2, this);
        };
    }

    document.querySelectorAll('.thumbnail').forEach(thumb => thumb.classList.remove('active'));
    if (thumbnails[0]) thumbnails[0].classList.add('active');

    updateAddButtonState();
    getCartManager()?.showToast?.(`Příchuť nastavena na ${flavor.shortName}`);
}

function selectPurchaseOption(optionKey, element) {
    if (!purchaseOptions[optionKey]) return;
    currentPurchaseOption = optionKey;

    document.querySelectorAll('.purchase-option').forEach(node => {
        node.classList.remove('active');
    });
    if (element) {
        element.classList.add('active');
    }

    updateAddButtonState();
}

function changeQuantity(delta) {
    const quantityEl = document.getElementById('quantity-value');
    if (!quantityEl) return;

    currentQuantity = Math.min(10, Math.max(1, currentQuantity + delta));
    quantityEl.textContent = String(currentQuantity);
    updateAddButtonState();
}

function toggleAccordion(header) {
    const item = header?.closest('.accordion-item');
    if (!item) return;

    const isActive = item.classList.contains('active');
    document.querySelectorAll('.accordion-item').forEach(node => node.classList.remove('active'));
    if (!isActive) {
        item.classList.add('active');
    }
}

function handleAddToCart(event) {
    event.preventDefault();

    const manager = getCartManager();
    if (!manager) return;

    const flavor = flavorData[currentFlavor];
    const option = purchaseOptions[currentPurchaseOption];

    const product = {
        id: `cans-${currentFlavor}`,
        name: flavor.name,
        price: option.price,
        image: flavor.images.mini
    };

    const variantLabel = `${flavor.shortName} - ${option.label.toLowerCase()}`;
    manager.addToCart(product, currentQuantity, variantLabel);

    const button = event.currentTarget;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-check"></i> Přidáno';
        button.classList.add('added');
        setTimeout(() => {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-cart-plus"></i> Přidat do košíku';
            button.classList.remove('added');
        }, 1800);
    }

    currentQuantity = 1;
    const quantityEl = document.getElementById('quantity-value');
    if (quantityEl) quantityEl.textContent = '1';
    updateAddButtonState();
}

document.addEventListener('DOMContentLoaded', () => {
    try { if (window.cartManager) window.cartManager.enableServerMode('/api'); } catch {}
    const initialFlavor = flavorData[currentFlavor];
    const container = document.querySelector('.container');
    if (container) {
        container.classList.add(initialFlavor.color);
    }

    const thumbnails = document.querySelectorAll('.thumbnail');
    if (thumbnails[0]) {
        thumbnails[0].querySelector('img').src = initialFlavor.images.thumb1;
        thumbnails[0].onclick = function () {
            changeImage(initialFlavor.images.thumb1, this);
        };
    }
    if (thumbnails[1]) {
        thumbnails[1].querySelector('img').src = initialFlavor.images.thumb2;
        thumbnails[1].onclick = function () {
            changeImage(initialFlavor.images.thumb2, this);
        };
    }

    const addButton = document.getElementById('addToCartBtn');
    if (addButton) {
        addButton.addEventListener('click', handleAddToCart);
    }

    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.addEventListener('click', () => {
            getCartManager()?.showToast?.('Zobrazuji seznam produktů');
        });
    }

    const firstAccordion = document.querySelector('.accordion-item');
    if (firstAccordion) {
        firstAccordion.classList.add('active');
    }

    updateAddButtonState();
});

window.selectFlavor = selectFlavor;
window.changeQuantity = changeQuantity;
window.selectPurchaseOption = selectPurchaseOption;
window.toggleAccordion = toggleAccordion;