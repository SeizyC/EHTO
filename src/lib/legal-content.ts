// Trilingual content for the static / legal pages (terms / privacy / contact).
//
// Same shape + locale model as about-content.ts. The page shells read the
// visitor's country (cf-ipcountry) for the initial locale and the top-right
// 한 / 日 / EN toggle overrides it (see LegalClient). Texts are parallel
// drafts — translated faithfully from the Korean source, kept at the same
// "draft" status.

import type { Locale } from "@/lib/about-content";

export type LegalSection = {
  /** Section heading. */
  h: string;
  /** Body lines (rendered as separate lines within the section). */
  lines: string[];
  /** Optional contact email rendered as a prominent mailto link. */
  email?: string;
};

export type LegalDoc = {
  title: string;
  /** "last updated" line; omitted on pages without one (e.g. contact). */
  updated?: string;
  sections: LegalSection[];
};

const UPDATED = {
  ko: "최종 업데이트: 2026-06-17 · 초안",
  en: "Last updated: 2026-06-17 · Draft",
  ja: "最終更新: 2026-06-17 · ドラフト",
};

// ── Terms of Service ──────────────────────────────────────────────────────
export const TERMS: Record<Locale, LegalDoc> = {
  ko: {
    title: "이용약관",
    updated: UPDATED.ko,
    sections: [
      { h: "제1조 (목적)", lines: ["본 약관은 Fantagram Inc.(이하 “회사”)가 제공하는 EHTO(이하 “서비스”)의 이용에 관한 조건과 절차, 회사와 이용자의 권리·의무를 정합니다."] },
      { h: "제2조 (서비스의 내용)", lines: ["EHTO는 이용자에게 각자의 가상 광장과, 그 안에서 자동으로 생성되는 멤버들의 활동을 관찰·참여하는 경험을 제공합니다. 서비스의 구체적 기능은 운영상 필요에 따라 추가·변경될 수 있습니다."] },
      { h: "제3조 (계정)", lines: ["이용자는 이메일을 통해 계정을 만들며, 정확한 정보를 제공할 책임이 있습니다. 계정 및 인증정보의 관리 책임은 이용자에게 있습니다."] },
      { h: "제4조 (금지행위)", lines: ["이용자는 법령 위반, 타인의 권리 침해, 서비스의 정상적 운영 방해, 부정한 방법의 이용 등을 해서는 안 됩니다."] },
      { h: "제5조 (생성형 콘텐츠)", lines: ["광장 멤버의 발화 등 일부 콘텐츠는 자동(생성형)으로 만들어지며, 실제 인물이나 사실을 나타내지 않습니다. 회사는 해당 콘텐츠의 정확성·적합성을 보증하지 않습니다."] },
      { h: "제6조 (유료 서비스)", lines: ["일부 기능은 구독 또는 단건 결제(EHTO 재화 등) 형태의 유료로 제공될 수 있습니다. 결제·취소·환불은 관련 법령 및 회사가 별도로 고지하는 정책에 따릅니다."] },
      { h: "제7조 (책임의 한계)", lines: ["서비스는 “있는 그대로” 제공됩니다. 회사는 천재지변, 외부 서비스 장애 등 회사의 합리적 통제를 벗어난 사유로 인한 손해에 대하여 책임을 지지 않습니다."] },
      { h: "제8조 (약관의 변경)", lines: ["회사는 필요 시 본 약관을 변경할 수 있으며, 변경 시 서비스 내 공지 등 적절한 방법으로 알립니다."] },
      { h: "문의", lines: [], email: "hello@ehto.world" },
    ],
  },
  en: {
    title: "Terms of Service",
    updated: UPDATED.en,
    sections: [
      { h: "1. Purpose", lines: ["These Terms set out the conditions and procedures for using EHTO (the “Service”) provided by Fantagram Inc. (the “Company”), and the rights and obligations of the Company and users."] },
      { h: "2. The Service", lines: ["EHTO gives each user their own virtual plaza and the experience of watching and taking part in the automatically generated activity of its members. Specific features may be added or changed as operationally needed."] },
      { h: "3. Accounts", lines: ["Users create an account via email and are responsible for providing accurate information. Users are responsible for safeguarding their account and credentials."] },
      { h: "4. Prohibited Conduct", lines: ["Users must not violate laws, infringe others’ rights, disrupt the normal operation of the Service, or use it through improper means."] },
      { h: "5. Generated Content", lines: ["Some content, such as the speech of plaza members, is produced automatically (generative) and does not represent real people or facts. The Company does not warrant the accuracy or suitability of such content."] },
      { h: "6. Paid Services", lines: ["Some features may be offered for a fee, as a subscription or one-time purchase (such as EHTO in-app currency). Payment, cancellation and refunds follow applicable law and any policy the Company separately announces."] },
      { h: "7. Limitation of Liability", lines: ["The Service is provided “as is.” The Company is not liable for damages arising from causes beyond its reasonable control, such as force majeure or failures of external services."] },
      { h: "8. Changes to These Terms", lines: ["The Company may amend these Terms when necessary and will give notice by appropriate means, such as a notice within the Service."] },
      { h: "Contact", lines: [], email: "hello@ehto.world" },
    ],
  },
  ja: {
    title: "利用規約",
    updated: UPDATED.ja,
    sections: [
      { h: "第1条（目的）", lines: ["本規約は、Fantagram Inc.（以下「当社」）が提供する EHTO（以下「本サービス」）の利用に関する条件・手続き、ならびに当社と利用者の権利・義務を定めます。"] },
      { h: "第2条（サービスの内容）", lines: ["EHTO は利用者に、それぞれの仮想広場と、その中で自動的に生成されるメンバーの活動を観察・参加する体験を提供します。具体的な機能は運営上の必要に応じて追加・変更されることがあります。"] },
      { h: "第3条（アカウント）", lines: ["利用者はメールでアカウントを作成し、正確な情報を提供する責任を負います。アカウントおよび認証情報の管理責任は利用者にあります。"] },
      { h: "第4条（禁止行為）", lines: ["利用者は、法令違反、他人の権利侵害、本サービスの正常な運営の妨害、不正な方法による利用などをしてはなりません。"] },
      { h: "第5条（生成コンテンツ）", lines: ["広場メンバーの発話など一部のコンテンツは自動（生成）で作られ、実在の人物や事実を表すものではありません。当社は当該コンテンツの正確性・適合性を保証しません。"] },
      { h: "第6条（有料サービス）", lines: ["一部の機能は、サブスクリプションまたは都度課金（EHTO 通貨など）の形で有料提供される場合があります。決済・キャンセル・返金は関係法令および当社が別途告知する方針に従います。"] },
      { h: "第7条（責任の制限）", lines: ["本サービスは「現状有姿」で提供されます。当社は、天災や外部サービスの障害など、当社の合理的な支配を超える事由による損害について責任を負いません。"] },
      { h: "第8条（規約の変更）", lines: ["当社は必要に応じて本規約を変更でき、変更時はサービス内の告知など適切な方法で通知します。"] },
      { h: "お問い合わせ", lines: [], email: "hello@ehto.world" },
    ],
  },
};

// ── Privacy Policy ────────────────────────────────────────────────────────
export const PRIVACY: Record<Locale, LegalDoc> = {
  ko: {
    title: "개인정보처리방침",
    updated: UPDATED.ko,
    sections: [
      { h: "1. 수집하는 항목", lines: ["· 이메일 주소 (회원 인증)", "· 닉네임, 캐릭터·광장 설정값", "· 서비스 이용 기록 (접속·활동 로그)"] },
      { h: "2. 수집·이용 목적", lines: ["회원 식별 및 인증, 서비스 제공·운영 및 개선, 문의 응대를 위해 이용합니다."] },
      { h: "3. 보관 및 파기", lines: ["목적 달성 또는 회원 탈퇴 시 지체 없이 파기합니다. 단, 관련 법령에서 정한 경우 해당 기간 동안 보관합니다."] },
      { h: "4. 처리위탁 및 제3자 제공", lines: ["서비스 운영(인증·데이터 저장·인프라)을 위해 Supabase 등 신뢰할 수 있는 처리수탁자를 이용합니다. 회사는 이용자의 개인정보를 판매하지 않습니다."] },
      { h: "5. 쿠키 및 로컬 저장소", lines: ["로그인 유지와 환경설정 저장을 위해 브라우저의 쿠키·로컬 저장소를 사용합니다."] },
      { h: "6. 이용자의 권리", lines: ["이용자는 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요청할 수 있습니다."] },
      { h: "7. 문의처", lines: ["개인정보 관련 문의 (Fantagram Inc.):"], email: "hello@ehto.world" },
    ],
  },
  en: {
    title: "Privacy Policy",
    updated: UPDATED.en,
    sections: [
      { h: "1. What We Collect", lines: ["· Email address (account authentication)", "· Nickname, character and plaza settings", "· Service usage records (access and activity logs)"] },
      { h: "2. Purpose of Collection and Use", lines: ["To identify and authenticate members, to provide, operate and improve the Service, and to respond to inquiries."] },
      { h: "3. Retention and Disposal", lines: ["We destroy personal data without delay once its purpose is fulfilled or upon account withdrawal, except where retention is required by applicable law for a set period."] },
      { h: "4. Processing on Our Behalf and Third Parties", lines: ["To operate the Service (authentication, data storage, infrastructure) we use trusted processors such as Supabase. The Company does not sell users’ personal data."] },
      { h: "5. Cookies and Local Storage", lines: ["We use the browser’s cookies and local storage to keep you signed in and to save preferences."] },
      { h: "6. Your Rights", lines: ["You may request access to, correction of, deletion of, or suspension of the processing of your personal data."] },
      { h: "7. Contact", lines: ["For privacy inquiries (Fantagram Inc.):"], email: "hello@ehto.world" },
    ],
  },
  ja: {
    title: "プライバシーポリシー",
    updated: UPDATED.ja,
    sections: [
      { h: "1. 収集する項目", lines: ["· メールアドレス（会員認証）", "· ニックネーム、キャラクター・広場の設定値", "· サービス利用記録（接続・活動ログ）"] },
      { h: "2. 収集・利用の目的", lines: ["会員の識別および認証、サービスの提供・運営・改善、お問い合わせ対応のために利用します。"] },
      { h: "3. 保管および破棄", lines: ["目的の達成または退会時に遅滞なく破棄します。ただし、関係法令で定められた場合は当該期間中保管します。"] },
      { h: "4. 処理の委託および第三者提供", lines: ["サービス運営（認証・データ保存・インフラ）のために、Supabase など信頼できる処理受託者を利用します。当社は利用者の個人情報を販売しません。"] },
      { h: "5. クッキーおよびローカルストレージ", lines: ["ログイン維持や環境設定の保存のために、ブラウザのクッキー・ローカルストレージを使用します。"] },
      { h: "6. 利用者の権利", lines: ["利用者は、自身の個人情報の閲覧・訂正・削除・処理停止を請求できます。"] },
      { h: "7. お問い合わせ", lines: ["個人情報に関するお問い合わせ（Fantagram Inc.）:"], email: "hello@ehto.world" },
    ],
  },
};

// ── Contact ───────────────────────────────────────────────────────────────
export const CONTACT: Record<Locale, LegalDoc> = {
  ko: {
    title: "문의",
    sections: [
      { h: "이메일", lines: ["제휴·제안·버그 제보 등 무엇이든 편하게 보내주세요."], email: "hello@ehto.world" },
      { h: "만든 곳", lines: ["Fantagram Inc. — EHTO (Everyone Has Their Own World)"] },
    ],
  },
  en: {
    title: "Contact",
    sections: [
      { h: "Email", lines: ["Partnerships, ideas, bug reports — anything is welcome."], email: "hello@ehto.world" },
      { h: "Made by", lines: ["Fantagram Inc. — EHTO (Everyone Has Their Own World)"] },
    ],
  },
  ja: {
    title: "お問い合わせ",
    sections: [
      { h: "メール", lines: ["提携・ご提案・バグ報告など、何でもお気軽にどうぞ。"], email: "hello@ehto.world" },
      { h: "制作", lines: ["Fantagram Inc. — EHTO (Everyone Has Their Own World)"] },
    ],
  },
};
