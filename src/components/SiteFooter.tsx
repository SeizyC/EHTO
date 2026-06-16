import Link from "next/link";

// Shared site footer: nav links + company line. Used on the landing and the
// static pages (about / terms / privacy / contact).
export function SiteFooter() {
  return (
    <footer className="text-dim mx-auto w-full max-w-[680px] px-6 pb-8 pt-4">
      <div className="border-line flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-[12px]">
        <Link href="/about" className="hover:text-sub transition">소개</Link>
        <Link href="/terms" className="hover:text-sub transition">이용약관</Link>
        <Link href="/privacy" className="hover:text-sub transition">개인정보처리방침</Link>
        <Link href="/contact" className="hover:text-sub transition">문의</Link>
        <span className="text-dim/80 ml-auto text-[11px]">© Fantagram Inc.</span>
      </div>
    </footer>
  );
}
