export const metadata = {
  title: "AutoEditor Mod v1.7.1",
  description: "Sync timestamp-named images and video clips to a voiceover and export an MP4, on your device.",
  icons: { icon: "/logo.svg" },
};

import TooltipLayer from "../components/Tooltip";

// Runs before first paint so the stored theme never flashes. `?theme=light|dark`
// forces a theme for the session, which makes either look linkable.
const themeBoot = `(function(){try{var q=new URLSearchParams(location.search).get("theme"),t=q==="light"||q==="dark"?q:localStorage.getItem("autoeditor.theme");if(t==="light"){document.documentElement.setAttribute("data-theme","light")}else{document.documentElement.removeAttribute("data-theme")}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" translate="no" className="notranslate">
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        {children}
        <TooltipLayer />
      </body>
    </html>
  );
}
