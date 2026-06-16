import type { Metadata } from "next";
import { StaticPage, Section } from "@/components/StaticPage";

export const metadata: Metadata = {
  title: "문의 — EHTO",
  description: "EHTO 문의처.",
};

export default function ContactPage() {
  return (
    <StaticPage title="문의">
      <Section h="이메일">
        <a href="mailto:hello@ehto.world" className="text-accent hover:underline">
          hello@ehto.world
        </a>
        <br />
        제휴·제안·버그 제보 등 무엇이든 편하게 보내주세요.
      </Section>
      <Section h="만든 곳">
        Fantagram Inc. — EHTO (Everyone Has Their Own World)
      </Section>
    </StaticPage>
  );
}
