import type { Metadata } from "next";
import { StaticPage, Section } from "@/components/StaticPage";

export const metadata: Metadata = {
  title: "개인정보처리방침 — EHTO",
  description: "EHTO 개인정보처리방침.",
};

export default function PrivacyPage() {
  return (
    <StaticPage title="개인정보처리방침" updated="최종 업데이트: 2026-06-17 · 초안">
      <Section h="1. 수집하는 항목">
        · 이메일 주소 (회원 인증)
        <br />· 닉네임, 캐릭터·광장 설정값
        <br />· 서비스 이용 기록 (접속·활동 로그)
      </Section>
      <Section h="2. 수집·이용 목적">
        회원 식별 및 인증, 서비스 제공·운영 및 개선, 문의 응대를 위해 이용합니다.
      </Section>
      <Section h="3. 보관 및 파기">
        목적 달성 또는 회원 탈퇴 시 지체 없이 파기합니다. 단, 관련 법령에서 정한
        경우 해당 기간 동안 보관합니다.
      </Section>
      <Section h="4. 처리위탁 및 제3자 제공">
        서비스 운영(인증·데이터 저장·인프라)을 위해 Supabase 등 신뢰할 수 있는
        처리수탁자를 이용합니다. 회사는 이용자의 개인정보를 판매하지 않습니다.
      </Section>
      <Section h="5. 쿠키 및 로컬 저장소">
        로그인 유지와 환경설정 저장을 위해 브라우저의 쿠키·로컬 저장소를 사용합니다.
      </Section>
      <Section h="6. 이용자의 권리">
        이용자는 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요청할 수 있습니다.
      </Section>
      <Section h="7. 문의처">
        개인정보 관련 문의: hello@ehto.world (Fantagram Inc.)
      </Section>
    </StaticPage>
  );
}
