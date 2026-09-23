export const metadata = {
  title: "AutoEditor Mod v1.6",
  description: "Sync timestamp-named images and video clips to a voiceover and export an MP4, on your device.",
  icons: { icon: "/logo.svg" },
};

import TooltipLayer from "../components/Tooltip";

export default function RootLayout({ children }) {
  return (
    <html lang="en" translate="no" className="notranslate">
      <body>
        {children}
        <TooltipLayer />
      </body>
    </html>
  );
}
