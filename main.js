
    // =========================
    // CONFIG
    // =========================
    const SUPABASE_URL = "https://ixqtbndjbqbkapghoszx.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_PAK28m8_Q4BpETQ0YWHjDg_oifolhDG";

    const TABLE_NAME = "menu_items_csv";
    const IMAGE_BUCKET = "menu-images-test";

    // =========================
    // STATE
    // =========================
    window.__db = window.__db || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const db = window.__db;

    let allItems = [];
    let currentCategory = "Food";

    // CART state (stored)
    const CART_KEY = "adi_menu_cart_v1";
    const ORDER_KEY = "adi_menu_ordercode_v1";

    // =========================
    // HELPERS
    // =========================
    const el = (id) => document.getElementById(id);

    function slugify(str) {
      return String(str || "")
        .trim()
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    }

    function priceUSD(value) {
      const n = Number(value);
      if (Number.isNaN(n)) return "";
      return `$${n.toFixed(2)}`;
    }

    function groupBy(arr, keyFn) {
      const map = new Map();
      for (const item of arr) {
        const key = keyFn(item) ?? "Other";
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
      }
      return map;
    }

    function sortByName(items) {
      return [...items].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      );
    }

    function getPublicImageUrl(image_path) {
      if (!image_path) return null;
      const safePath = String(image_path)
        .trim()
        .split("/")
        .map(part => encodeURIComponent(part.trim()))
        .join("/");
      return `${SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${safePath}`;
    }

    function resolveImageUrl(item) {
      return item.image_path ? getPublicImageUrl(item.image_path) : null;
    }

    // =========================
    // CART FUNCTIONS
    // =========================
    function loadCart() {
      try { return JSON.parse(localStorage.getItem(CART_KEY) || "{}"); }
      catch { return {}; }
    }

    function saveCart(cart) {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      updateCartBadge();
    }

    function getOrderCode() {
      let code = localStorage.getItem(ORDER_KEY);
      if (!code) {
        code = generateOrderCode();
        localStorage.setItem(ORDER_KEY, code);
      }
      return code;
    }

    function generateOrderCode() {
      const n = Math.floor(100000 + Math.random() * 900000);
      return `ADI-${n}`;
    }

    function cartCount(cart) {
      return Object.values(cart).reduce((sum, x) => sum + (Number(x.qty) || 0), 0);
    }

    function updateCartBadge() {
      const cart = loadCart();
      el("cartCountBadge").textContent = cartCount(cart);
    }

    function addToCart(item) {
      const cart = loadCart();
      const id = String(item.id);

      if (!cart[id]) {
        cart[id] = {
          id: item.id,
          name: item.name || "",
          price: Number(item.price) || 0,
          image_path: item.image_path || null,
          qty: 0
        };
      }
      cart[id].qty += 1;
      saveCart(cart);
    }

    function changeQty(itemId, delta) {
      const cart = loadCart();
      const id = String(itemId);
      if (!cart[id]) return;

      cart[id].qty = (Number(cart[id].qty) || 0) + delta;
      if (cart[id].qty <= 0) delete cart[id];

      saveCart(cart);
      renderCartModal();
    }

    function clearCart() {
      localStorage.removeItem(CART_KEY);
      updateCartBadge();
      renderCartModal();
    }

    function calcTotal(cart) {
      return Object.values(cart).reduce((sum, x) => sum + (Number(x.price)||0) * (Number(x.qty)||0), 0);
    }

    function renderCartModal() {
      const cart = loadCart();
      const items = Object.values(cart);

      const list = el("cartList");
      const empty = el("cartEmpty");

      el("cartOrderCode").textContent = `Order Code: ${getOrderCode()}`;
      list.innerHTML = "";

      if (items.length === 0) {
        empty.style.display = "block";
      } else {
        empty.style.display = "none";
        for (const it of items) {
          const imgUrl = it.image_path ? getPublicImageUrl(it.image_path) : null;
          const finalImgUrl = imgUrl || "./assets/placeholder.webp";

          const row = document.createElement("div");
          row.className = "list-group-item d-flex align-items-center justify-content-between gap-3";

          row.innerHTML = `
            <div class="d-flex align-items-center gap-3" style="min-width:0;">
              <img class="cart-item-img" src="${finalImgUrl}" onerror="this.onerror=null;this.src='./assets/placeholder.webp';" alt="">
              <div style="min-width:0;">
                <div class="fw-semibold cart-item-name">${it.name}</div>
                <div class="small text-muted">${priceUSD(it.price)} each</div>
              </div>
            </div>

            <div class="d-flex align-items-center gap-2">
              <button class="btn btn-sm btn-outline-secondary" data-cart-dec="${it.id}">−</button>
              <span class="fw-semibold" style="min-width:24px; text-align:center;">${it.qty}</span>
              <button class="btn btn-sm btn-outline-secondary" data-cart-inc="${it.id}">+</button>
              <div class="fw-bold ms-2">${priceUSD((Number(it.price)||0) * (Number(it.qty)||0))}</div>
            </div>
          `;

          list.appendChild(row);
        }
      }

      el("cartTotal").textContent = priceUSD(calcTotal(cart));
    }

    // =========================
    // FETCH
    // =========================
    async function fetchMenuItems() {
      el("statusText").textContent = "Loading menu from database…";

      const { data, error } = await db
        .from(TABLE_NAME)
        .select("id, category, subcategory, subcategory_order, name, description, price, image_path, is_available")
        .eq("is_available", true);

      if (error) {
        console.error("Supabase error:", error);
        el("statusText").textContent = "Failed to load menu.";
        el("content").innerHTML = `
          <div class="alert alert-danger">
            <div class="fw-semibold mb-2">Could not load menu items</div>
            <pre class="mb-0">${JSON.stringify(error, null, 2)}</pre>
          </div>`;
        return;
      }

      allItems = data || [];
      el("statusText").style.display = "none";
    }

    // =========================
    // DESCRIPTION EXPAND
    // =========================
    document.addEventListener("click", (e) => {
      const wrap = e.target.closest(".item-desc-wrap");
      if (!wrap) return;

      const desc = wrap.querySelector(".item-desc");
      if (!desc) return;

      desc.classList.toggle("expanded");
      wrap.classList.toggle("expanded");
    });

    function markTruncatedDescriptions() {
      requestAnimationFrame(() => {
        document.querySelectorAll(".item-desc-wrap").forEach(wrap => {
          wrap.classList.remove("truncated");
          const desc = wrap.querySelector(".item-desc");
          if (!desc) return;

          if (!desc.classList.contains("expanded") && desc.scrollHeight > desc.clientHeight + 1) {
            wrap.classList.add("truncated");
          }
        });
      });
    }

    // =========================
    // RENDER
    // =========================
    function renderCategoryButtons() {
      document.querySelectorAll(".category-btn").forEach(btn => {
        const cat = btn.getAttribute("data-category");
        btn.classList.toggle("active", cat === currentCategory);
      });
    }

    function renderSubcategoryStrip(subcategories) {
      const strip = el("subcatStrip");
      strip.innerHTML = "";

      if (subcategories.length === 0) {
        strip.innerHTML = `<span class="text-muted">No subcategories found.</span>`;
        return;
      }

      for (const sub of subcategories) {
        const anchorId = `${slugify(currentCategory)}-${slugify(sub)}`;

        const a = document.createElement("a");
        a.href = `#${anchorId}`;
        a.className = "btn btn-sm btn-outline-primary subcat-chip";
        a.textContent = sub;

        a.addEventListener("click", (e) => {
          e.preventDefault();
          const target = document.getElementById(anchorId);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
          history.replaceState(null, "", `#${anchorId}`);
        });

        strip.appendChild(a);
      }
    }

    function renderSections(itemsForCategory) {
      const content = el("content");
      content.innerHTML = "";

      if (itemsForCategory.length === 0) {
        content.innerHTML = `
          <div class="alert alert-warning">
            No items found in <strong>${currentCategory}</strong>.
          </div>`;
        return;
      }

      const grouped = groupBy(itemsForCategory, x => x.subcategory || "Other");
      const subcats = Array.from(grouped.keys()).sort((a, b) => {
        const oa = Math.min(...(grouped.get(a) || []).map(x => Number(x.subcategory_order ?? 999)));
        const ob = Math.min(...(grouped.get(b) || []).map(x => Number(x.subcategory_order ?? 999)));
        if (oa !== ob) return oa - ob;
        return String(a).localeCompare(String(b));
      });

      for (const subcat of subcats) {
        const sectionId = `${slugify(currentCategory)}-${slugify(subcat)}`;

        const section = document.createElement("section");
        section.className = "mb-5 section-anchor";
        section.id = sectionId;

        section.innerHTML = `
          <div class="d-flex align-items-center justify-content-between mb-3">
            <h2 class="subcat-title">${subcat}</h2>
          </div>
          <div class="row g-3" id="grid-${sectionId}"></div>
        `;

        content.appendChild(section);

        const grid = document.getElementById(`grid-${sectionId}`);
        const itemsSorted = sortByName(grouped.get(subcat));

        for (const item of itemsSorted) {
          const imgUrl = resolveImageUrl(item);
          const finalImgUrl = imgUrl || "./assets/placeholder.webp";

          const col = document.createElement("div");
          col.className = "col-12 col-md-6 col-lg-4";

          col.innerHTML = `
            <div class="card menu-card h-100">
<img
  src="${finalImgUrl}"
  alt="${item.name || "Menu item"}"
  class="item-img"
  loading="lazy"
  style="cursor: zoom-in;"
  data-bs-toggle="modal"
  data-bs-target="#imgModal"
  data-fullimg="${finalImgUrl}"
  onerror="this.onerror=null; this.src='./assets/placeholder.webp';"
/>


              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start gap-3">
                  <div style="min-width:0;">
                    <div class="item-name fw-semibold">${item.name ?? ""}</div>
                    ${
                      item.description
                        ? `
                          <div class="item-desc-wrap">
                            <span class="item-desc">${item.description}</span>
                            <span class="desc-more">more</span>
                          </div>`
                        : ""
                    }
                  </div>

                <div class="d-flex flex-column align-items-end">
  <div class="price">${priceUSD(item.price)}</div>

  <button class="btn btn-sm btn-outline-dark mt-2 order-btn"
          data-add-to-cart="${item.id}">
    Add order
  </button>
</div>

                </div>
              </div>
            </div>
          `;

          grid.appendChild(col);
        }
      }

      markTruncatedDescriptions();
    }

    function renderCurrentCategory() {
      renderCategoryButtons();

      const itemsForCategory = allItems.filter(x =>
        String(x.category || "").trim().toLowerCase() === currentCategory.toLowerCase()
      );

      const grouped = groupBy(itemsForCategory, x => x.subcategory || "Other");
      const subcategories = Array.from(grouped.keys()).sort((a, b) => {
        const oa = Math.min(...(grouped.get(a) || []).map(x => Number(x.subcategory_order ?? 999)));
        const ob = Math.min(...(grouped.get(b) || []).map(x => Number(x.subcategory_order ?? 999)));
        if (oa !== ob) return oa - ob;
        return String(a).localeCompare(String(b));
      });

      renderSubcategoryStrip(subcategories);
      renderSections(itemsForCategory);
    }

    // =========================
    // EVENTS
    // =========================
    function wireEvents() {
      document.querySelectorAll(".category-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          currentCategory = btn.getAttribute("data-category");
          renderCurrentCategory();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      });

      el("scrollToTopBtn").addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      // Delegate clicks: add-to-cart / cart qty
      document.addEventListener("click", (e) => {
        const addBtn = e.target.closest("[data-add-to-cart]");
        if (addBtn) {
          const id = addBtn.getAttribute("data-add-to-cart");
          const item = allItems.find(x => String(x.id) === String(id));
          if (item) addToCart(item);
          return;
        }

        const inc = e.target.closest("[data-cart-inc]");
        if (inc) {
          changeQty(inc.getAttribute("data-cart-inc"), +1);
          return;
        }

        const dec = e.target.closest("[data-cart-dec]");
        if (dec) {
          changeQty(dec.getAttribute("data-cart-dec"), -1);
          return;
        }
      });

      // When cart modal opens
      const cartModalEl = document.getElementById("cartModal");
      cartModalEl.addEventListener("show.bs.modal", () => {
        renderCartModal();
      });

      // Clear cart
      el("clearCartBtn").addEventListener("click", () => {
        clearCart();
      });
    }

    // =========================
    // INIT
    // =========================
    (async function init() {
      updateCartBadge();
      wireEvents();
      await fetchMenuItems();
      renderCurrentCategory();
    })();
    document.addEventListener("click", (e) => {
  const img = e.target.closest("img[data-fullimg]");
  if (!img) return;

  const modalImg = document.getElementById("imgModalEl");
  modalImg.src = img.getAttribute("data-fullimg");
  modalImg.alt = img.alt || "Image";
});
