import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CartProvider } from "./context/CartContext";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import CartDrawer from "./components/CartDrawer";
import WhatsAppButton from "./components/WhatsAppButton";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "E-Bazaar — Your WhatsApp Marketplace",
  description:
    "Shop from thousands of Pakistani sellers. List products effortlessly via WhatsApp voice messages. E-Bazaar connects buyers and sellers across Pakistan.",
  keywords: ["e-bazaar", "whatsapp marketplace", "pakistan shopping", "online store pakistan", "sell on whatsapp"],
  authors: [{ name: "Munshi" }],
  openGraph: {
    title: "E-Bazaar — Your WhatsApp Marketplace",
    description: "Shop from thousands of Pakistani sellers. List products via WhatsApp.",
    type: "website",
    locale: "en_PK"
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
          <meta name="google-site-verification" content="Ow6S_w9xEw0EvkP1SnVOqfvoDwSHAgTEKkeTCKL6gZU" />
      </head>
      <body>
        <CartProvider>
          <Navbar />
          <main>{children}</main>
          <Footer />
          <CartDrawer />
          <WhatsAppButton phoneNumber="923460392313" />
        </CartProvider>
      </body>
    </html>
  );
}
