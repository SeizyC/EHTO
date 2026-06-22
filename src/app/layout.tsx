import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import PageViewBeacon from "@/components/PageViewBeacon";
import { FontLoader } from "@/components/FontLoader";

const SITE_URL = "https://ehto.world";
const OG_IMAGE = { url: `${SITE_URL}/og_ehto.jpeg`, width: 1340, height: 813, alt: "EHTO — Everyone Has Their Own World" };

// Site-wide defaults. Individual routes (e.g. /about) may override title,
// description and images; this provides the Open Graph / Twitter card and
// canonical base for everything else, including the landing page.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "EHTO — Everyone Has Their Own World",
  description: "나를 중심으로 연결되는 작은 세상.",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "EHTO",
    title: "EHTO — Everyone Has Their Own World",
    description: "나를 중심으로 연결되는 작은 세상.",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "EHTO — Everyone Has Their Own World",
    description: "나를 중심으로 연결되는 작은 세상.",
    images: [OG_IMAGE.url],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#110E14",
};

// Auto-recover from stale static assets. Triggers on:
//   1. dev: file edit rotates chunk hashes; a tab that was suspended
//      (background, sleep) wakes up holding old chunk URLs.
//   2. prod: every Cloudflare deploy uploads new content-hashed
//      chunks. Cached HTML in browser cache points at deleted URLs.
// We listen for <link>/<script> errors and `unhandledrejection` of
// dynamic import failures, then reload once. A 5s cooldown +
// sessionStorage flag prevents reload loops if the failure is real
// (network down, asset truly missing).
const RELOAD_GUARD = `
(function(){
  var KEY='ehto:stale-reload:last';
  function shouldReload(){
    try{
      var last=Number(sessionStorage.getItem(KEY)||0);
      if(Date.now()-last<5000) return false;
      sessionStorage.setItem(KEY,String(Date.now()));
      return true;
    }catch(e){ return true; }
  }
  function isStaleAsset(target){
    if(!target) return false;
    var tag=target.tagName;
    var src=target.src||target.href||'';
    return (tag==='SCRIPT'||tag==='LINK') && /\\/_next\\/static\\//.test(src);
  }
  window.addEventListener('error', function(e){
    if(isStaleAsset(e.target) && shouldReload()){
      console.warn('[stale-reload] missing asset, reloading:', e.target.src||e.target.href);
      location.reload();
    }
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    var msg=String(e.reason && e.reason.message || '');
    if((/ChunkLoadError|Loading chunk|Loading CSS chunk/i).test(msg) && shouldReload()){
      console.warn('[stale-reload] chunk load failed, reloading:', msg);
      location.reload();
    }
  });
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-bg text-ink min-h-dvh font-sans antialiased">
        <Script id="stale-asset-reload" strategy="beforeInteractive">
          {RELOAD_GUARD}
        </Script>
        <FontLoader />
        {/* PageViewBeacon reads the auth token from localStorage (no SDK), so
            it stays out of the marketing bundle. AuthProvider now lives in the
            (app) route group — see src/app/(app)/layout.tsx. */}
        <PageViewBeacon />
        {children}
      </body>
    </html>
  );
}
