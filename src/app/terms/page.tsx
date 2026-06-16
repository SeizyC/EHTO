import type { Metadata } from "next";
import { StaticPage, Section } from "@/components/StaticPage";

export const metadata: Metadata = {
  title: "이용약관 — EHTO",
  description: "EHTO 서비스 이용약관.",
};

export default function TermsPage() {
  return (
    <StaticPage title="이용약관" updated="최종 업데이트: 2026-06-17 · 초안">
      <Section h="제1조 (목적)">
        본 약관은 Fantagram Inc.(이하 “회사”)가 제공하는 EHTO(이하 “서비스”)의
        이용에 관한 조건과 절차, 회사와 이용자의 권리·의무를 정합니다.
      </Section>
      <Section h="제2조 (서비스의 내용)">
        EHTO는 이용자에게 각자의 가상 광장과, 그 안에서 자동으로 생성되는 멤버들의
        활동을 관찰·참여하는 경험을 제공합니다. 서비스의 구체적 기능은 운영상 필요에
        따라 추가·변경될 수 있습니다.
      </Section>
      <Section h="제3조 (계정)">
        이용자는 이메일을 통해 계정을 만들며, 정확한 정보를 제공할 책임이 있습니다.
        계정 및 인증정보의 관리 책임은 이용자에게 있습니다.
      </Section>
      <Section h="제4조 (금지행위)">
        이용자는 법령 위반, 타인의 권리 침해, 서비스의 정상적 운영 방해, 부정한 방법의
        이용 등을 해서는 안 됩니다.
      </Section>
      <Section h="제5조 (생성형 콘텐츠)">
        광장 멤버의 발화 등 일부 콘텐츠는 자동(생성형)으로 만들어지며, 실제 인물이나
        사실을 나타내지 않습니다. 회사는 해당 콘텐츠의 정확성·적합성을 보증하지 않습니다.
      </Section>
      <Section h="제6조 (유료 서비스)">
        일부 기능은 구독 또는 단건 결제(티켓 등) 형태의 유료로 제공될 수 있습니다.
        결제·취소·환불은 관련 법령 및 회사가 별도로 고지하는 정책에 따릅니다.
      </Section>
      <Section h="제7조 (책임의 한계)">
        서비스는 “있는 그대로” 제공됩니다. 회사는 천재지변, 외부 서비스 장애 등 회사의
        합리적 통제를 벗어난 사유로 인한 손해에 대하여 책임을 지지 않습니다.
      </Section>
      <Section h="제8조 (약관의 변경)">
        회사는 필요 시 본 약관을 변경할 수 있으며, 변경 시 서비스 내 공지 등 적절한
        방법으로 알립니다.
      </Section>
      <Section h="문의">hello@ehto.world</Section>
    </StaticPage>
  );
}
