import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Recallio",
    short_name: "Recallio",
    lang: "pl",
    start_url: "/study",
    scope: "/",
    display: "standalone",
    background_color: "#f6f3f7",
    theme_color: "#584080",
    icons: [
      { src: "/icons/recallio-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icons/recallio-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/recallio-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
