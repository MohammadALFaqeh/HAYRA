import type { MetadataRoute } from "next";

// يُستخدم لتثبيت الموقع كتطبيق، ولتطبيق الأندرويد (TWA) الذي يفتح الموقع بملء الشاشة
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "حيرة | HAYRA",
    short_name: "حيرة",
    description: "لعبة أسئلة جماعية بين فريقين بأجواء برامج المسابقات",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#080d2e",
    theme_color: "#080d2e",
    icons: [
      { src: "/brand/app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/app-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
