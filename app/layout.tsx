import type { Metadata, Viewport } from "next";
import { Fredoka, Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

// Arredondada e em negrito: acessivel e leve, como pede a identidade.
const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ApoQuiz — sua apostila de questões virou quiz",
  description:
    "Suba o PDF da sua apostila de questões e transforme em um quiz interativo com gabarito, correção instantânea e revisão comentada.",
  applicationName: "ApoQuiz",
  keywords: ["apostila", "questões", "quiz", "gabarito", "estudo", "prova"],
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "ApoQuiz",
    description:
      "Transforme o PDF da sua apostila em um quiz interativo com gabarito.",
    type: "website",
    locale: "pt_BR",
  },
};

export const viewport: Viewport = {
  themeColor: "#07070d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const appleWebApp = {
  capable: true,
  title: "ApoQuiz",
  statusBarStyle: "black-translucent",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${instrument.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
