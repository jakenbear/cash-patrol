import sharp from "sharp";

const source = "public/cash-icon.svg";
const icons = [
  ["public/pwa-192x192.png", 192],
  ["public/pwa-512x512.png", 512],
  ["public/maskable-icon-512x512.png", 512],
  ["public/apple-touch-icon.png", 180],
];

await Promise.all(
  icons.map(([output, size]) =>
    sharp(source).resize(size, size).png({ compressionLevel: 9 }).toFile(output),
  ),
);

console.log("Generated PWA icons.");
