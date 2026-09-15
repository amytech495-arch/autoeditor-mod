export const metadata = {
  title: "AutoEditor Mod",
  description: "Sync timestamp-named images and video clips to a voiceover and export an MP4, on your device.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" translate="no" className="notranslate">
      <body>{children}</body>
    </html>
  );
}
