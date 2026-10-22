@AGENTS.md

# Munshi & E-Bazaar Codebase Guide

This document provides a comprehensive architectural overview, operational workflows, and guidelines for the **Munshi** WhatsApp AI assistant and the **E-Bazaar** web storefront.

---

## 1. Project Overview & Philosophy

**Munshi** is a WhatsApp-first conversational e-commerce platform designed for Pakistan. The platform bridges the digital divide for local merchants who may lack English fluency or technical expertise.

- **For Sellers:** Merchants list, edit, and manage products purely by sending **voice notes, text messages, or images** over WhatsApp in **Urdu (Native or Roman), English, Punjabi, Sindhi, or Pashto**.
- **For Buyers:** A modern, mobile-responsive Next.js web storefront (**E-Bazaar**) allows buyers to browse catalog items, search, filter by category, and place orders via itemized WhatsApp messages.
- **Backend Bridge:** Shared data is managed via **Supabase** (Postgres DB + S3-compatible Object Storage for product images).

---

## 2. High-Level Architecture

```
                       ┌──────────────────────────────────────────────┐
                       │          WhatsApp User (Seller/Buyer)        │
                       └──────────────────────┬───────────────────────┘
                                              │ (Voice, Text, Media)
                                              ▼
                       ┌──────────────────────────────────────────────┐
                       │           Munshi WhatsApp Bot Engine         │
                       │                   (index.js)                 │
                       │  - Baileys (WhatsApp Web Socket)             │
                       │  - Groq Whisper-Large-v3 (Voice to text)     │
                       │  - Google Gemini AI (Fallback & Vision)      │
                       │  - Pexels & Unsplash APIs (Stock photos)     │
                       │  - KeyPool & Rate Limit Management           │
                       └──────────────────────┬───────────────────────┘
                                              │ Read / Write
                                              ▼
                       ┌──────────────────────────────────────────────┐
                       │               Supabase Backend               │
                       │  - Database: sellers, buyers, products,      │
                       │              orders                          │
                       │  - Storage: product-images bucket            │
                       └──────────────────────┬───────────────────────┘
                                              │ Real-time / Queries
                                              ▼
                       ┌──────────────────────────────────────────────┐
                       │             E-Bazaar Storefront              │
                       │                 (app/ directory)             │
                       │  - Next.js (App Router) + React 19           │
                       │  - Tailwind CSS + Vanilla CSS Tokens         │
                       │  - Cart Drawer & LocalStorage Sync           │
                       │  - WhatsApp Deep-Link Checkout (wa.me)       │
                       │  - Dynamic XML Sitemap & SEO Metadata        │
                       └──────────────────────┘
```

---

## 3. Directory Structure

```
munshi-frontend/
├── app/                                # Next.js Web Storefront
│   ├── cart/
│   │   └── page.tsx                    # Cart & Order Summary page with WhatsApp checkout
│   ├── components/
│   │   ├── CartDrawer.tsx              # Slide-over cart overlay
│   │   ├── CategoryBar.tsx             # Horizontal category filter pills
│   │   ├── Footer.tsx                  # Storefront footer with links & contact info
│   │   ├── LoadingSkeleton.tsx         # Skeleton placeholders for async loading states
│   │   ├── Navbar.tsx                  # Sticky header with search, cart badge, mobile drawer
│   │   ├── ProductCard.tsx             # Individual product card (image, price, seller tag, CTA)
│   │   ├── ProductGrid.tsx             # Responsive grid display for products
│   │   ├── SearchBar.tsx               # Client-side search input navigating to /products?search=...
│   │   ├── SellerBadge.tsx             # Visual chip indicating the seller's store name
│   │   └── WhatsAppButton.tsx          # Floating animated WhatsApp CTA button
│   ├── context/
│   │   └── CartContext.tsx             # Cart state (useReducer) + LocalStorage persistence
│   ├── products/
│   │   ├── page.tsx                    # Suspense wrapper for product listing
│   │   ├── ProductsContent.tsx         # Catalog browser with live search, filters, sorting
│   │   └── [id]/
│   │       └── page.tsx                # Dynamic Product Detail Page (PDP) & related products
│   ├── seller/
│   │   └── page.tsx                    # Seller onboarding guide & seller inventory viewer
│   ├── globals.css                     # Design tokens (colors, radii, shadows, animations)
│   ├── layout.tsx                      # Root layout, Google verification, CartProvider
│   ├── page.tsx                        # Homepage (Hero, Categories, Fresh Listings, CTA)
│   ├── robots.ts                       # Dynamic robots.txt configuration
│   └── sitemap.ts                      # Dynamic sitemap generator indexing all Supabase products
├── lib/
│   └── supabase.js                     # Supabase browser client initialization
├── index.js                            # Core Munshi WhatsApp Bot (Baileys + AI pipeline)
├── index-old.js                        # Previous bot iteration backup
├── list-models.js                      # Diagnostic script to list available Gemini models
├── package.json                        # Dependencies & npm scripts
├── tsconfig.json                       # TypeScript configuration
└── .env                                # Environment variables
```

---

## 4. Subsystem Deep-Dive

### A. Munshi WhatsApp Bot (`index.js`)

The bot operates as an event-driven daemon running on Node.js using `@whiskeysockets/baileys`:

1. **Connection & Concurrency:**
   - **WhatsApp Pairing**: Authenticates via pairing codes using `useMultiFileAuthState('auth_session')`.
   - **Per-Sender Lock (`runExclusive`)**: Implements sequential Promise chains (`senderLocks`) keyed by WhatsApp JID to prevent race conditions during rapid audio or text messages.
   - **Session Lifecycle**: In-memory sessions are maintained in `sessions` Map; an automatic cleanup sweeps sessions inactive for 24 hours.

2. **Multilingual Speech-to-Text Pipeline:**
   - Transcribes voice notes (`.ogg`) using **Groq Whisper Large v3** (`transcribeAudio`).
   - Multi-key rotation (`KeyPool`) automatically marks rate-limited keys as resting and rotates to available keys.
   - Robust fallback to **Google Gemini Flash Lite** audio transcription if Groq keys are exhausted.

3. **Intent Classification & Extraction:**
   - **Mode Classification (`classifyMode`)**: Categorizes user intent into `selling`, `editing`, `buying`, `my_orders`, or `other`.
   - **Language Switch Detection (`detectLanguageSwitch`)**: Understands when users switch languages (Urdu, English, Roman Urdu).
   - **Entity Extraction (`buildExtractionPrompt`)**: Extracts fields including `product_name`, `retail_price`, `wholesale_price`, `quantity`, `description`, `brand`, `category`, `color`, and `condition`.
   - Conversational state prompts for any missing required fields.

4. **Vision & Automated Image Discovery:**
   - If the merchant sends photos, images are uploaded directly to the Supabase `product-images` storage bucket with magic-byte validation.
   - If no photos are provided and the seller asks for images, Munshi queries **Pexels** / **Unsplash**, runs **Gemini Vision** verification (`verifyImageMatchesProduct`) to confirm whether the image accurately matches the product title/specs, and sends a candidate to WhatsApp asking for approval ("haan" or "nahi").

5. **Editing & Inventory Operations:**
   - Supports conversational management: sellers can ask "kitne products hain" for inventory counts, modify price or stock, delete/deactivate products (`status = 'inactive'`), or re-order product images via WhatsApp replies.

---

### B. E-Bazaar Web Storefront (`app/`)

Built on **Next.js 16** with **React 19** and **Tailwind CSS v4**:

1. **Design System & Aesthetics (`globals.css`):**
   - Palette tailored for Pakistani commerce: vibrant orange primary (`#F85606`), WhatsApp green (`#25D366`), and dark slate tones (`#0F0F1A`).
   - Clean spacing scale, elevation shadows, floating keyframes, and smooth micro-interactions.

2. **State Management (`CartContext.tsx`):**
   - Implemented using React `useReducer` and Context API.
   - Full persistence: syncs cart contents to `localStorage` (`e-bazaar-cart`).
   - Powers both the slide-over `CartDrawer.tsx` and the dedicated `cart/page.tsx`.

3. **Cart & WhatsApp Checkout Integration:**
   - Generates an itemized order message:
     ```
     Hi! I'd like to place an order from E-Bazaar:
     • Embroidered Kameez × 1 = Rs. 2,500
     Total: Rs. 2,500
     Kindly confirm availability and payment details.
     ```
   - Automatically directs buyers to WhatsApp (`wa.me`) to finalize COD (Cash on Delivery) or bank transfers directly with the platform or seller.

4. **Product Catalog & Detail Pages:**
   - **Catalog Browser (`ProductsContent.tsx`)**: Supports case-insensitive partial search (`ilike`), category filters (Fashion, Electronics, Groceries, etc.), and price/date sorting.
   - **Product Detail (`[id]/page.tsx`)**: High-res image gallery, stock alerts, seller badge with direct WhatsApp contact link, and related product recommendations.

5. **SEO & Discovery (`sitemap.ts` & `robots.ts`):**
   - Dynamically indexes all active product pages directly from Supabase.

---

## 5. Supabase Data Model

- **`sellers`**:
  - `id`: UUID (Primary Key)
  - `whatsapp_number`: string
  - `store_name`: string
  - `contact_number`: string
  - `language`: string
- **`buyers`**:
  - `id`: UUID (Primary Key)
  - `whatsapp_number`: string
  - `language`: string
- **`products`**:
  - `id`: UUID (Primary Key)
  - `seller_id`: UUID (Foreign Key -> `sellers.id`)
  - `product_name`: string
  - `retail_price`: string
  - `price_numeric`: numeric
  - `wholesale_price`: string
  - `quantity`: numeric
  - `description`: text
  - `category`: string
  - `brand`: string
  - `color`: string
  - `condition`: string
  - `status`: `'active'` | `'inactive'`
  - `image_urls`: string array
  - `created_at` / `updated_at`: timestamps
- **`orders`**:
  - `id`: UUID (Primary Key)
  - `buyer_id`: UUID (Foreign Key -> `buyers.id`)
  - `seller_id`: UUID (Foreign Key -> `sellers.id`)
  - `product_id`: UUID (Foreign Key -> `products.id`)
  - `status`: `'pending'` | `'completed'` | `'cancelled'`
- **Storage Bucket**:
  - `product-images`: Public bucket containing uploaded seller photos.

---

## 6. Key Commands

```bash
# Run Next.js storefront locally
npm run dev

# Build storefront for production
npm run build

# Start production storefront server
npm run start

# Run ESLint check
npm run lint

# Start Munshi WhatsApp Bot (requires .env configuration)
node index.js

# List available Gemini generative models
node list-models.js
```

---

## 7. Environment Configuration (`.env`)

```env
# Frontend Supabase (Public)
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<public-anon-key>

# Storefront URL
NEXT_PUBLIC_SITE_URL=https://munshi-phi.vercel.app

# WhatsApp Bot Engine (.env / runtime only)
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
STOREFRONT_URL=http://localhost:3000

# AI Provider Keys (Supports _1, _2 pools for rotation)
GEMINI_API_KEY=<gemini-api-key>
GEMINI_API_KEY_1=<gemini-key-1>
GROQ_API_KEY_1=<groq-key-1>

# Optional Image APIs
PEXELS_API_KEY=<pexels-key>
UNSPLASH_ACCESS_KEY=<unsplash-key>
```
