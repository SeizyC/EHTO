// Trilingual UI copy for the onboarding funnel — login, signup, the /start
// invite-code wizard, the auth modal, the OAuth callback, the profile invite
// panel, and the character-builder chrome. Mirrors the LANDING/ABOUT pattern
// in about-content.ts: a Record<Locale, …> dictionary consumed as
// `ONBOARDING[locale]`. Placeholders like {n}/{max} are filled at the call
// site with String.replace.
//
// Character option labels (성별/착장 pills) live in OPTION_LABELS keyed by the
// option id, so prompts.ts stays untouched (its Korean `label` remains the
// fallback).

import type { Locale } from "@/lib/about-content";

export type OnboardingCopy = {
  login: {
    title: string;
    sub: string;
    email: string;
    password: string;
    submit: string;
    submitting: string;
    noAccount: string;
    signupLink: string;
    errBadCreds: string;
    errUnconfirmed: string;
  };
  signup: {
    title: string;
    sub: string;
    email: string;
    password: string;
    passwordConfirm: string;
    submit: string;
    submitting: string;
    haveAccount: string;
    loginLink: string;
    errShortPw: string;
    errMismatch: string;
    confirmSent: string;
    errEmailTaken: string;
    errPwShort: string;
    errBadEmail: string;
  };
  start: {
    codeTitle: string;
    codeSub: string;
    codePlaceholder: string;
    codeInvalid: string;
    nameTitle: string;
    nameSub: string;
    namePlaceholder: string;
    nameInvalid: string;
    next: string;
    back: string;
    haveAccount: string;
    netErr: string;
    finalizeFail: string;
    codeConsumed: string;
    noSession: string;
    okTitle: string;
    okBody: string;
    okCta: string;
    failTitle: string;
    failBody: string;
    failCta: string;
  };
  auth: {
    signupTitle: string;
    loginTitle: string;
    google: string;
    email: string;
    passwordPlaceholder: string;
    confirmSent: string;
    signupBtn: string;
    loginBtn: string;
    toLogin: string;
    toSignup: string;
    working: string;
    googleGoing: string;
  };
  callback: {
    entering: string;
    failed: string;
  };
  invite: {
    title: string;
    status: string; // "{used}/{total} …"
    copy: string;
    copied: string;
    used: string;
  };
  character: {
    selTitle: string;
    selSub: string;
    secGender: string;
    secSkin: string;
    secHair: string;
    secHairColor: string;
    secOutfit: string;
    secAccessory: string;
    plazaLang: string;
    plazaLangDesc: string;
    createBtn: string; // "… {n} …"
    createBtnExhausted: string;
    selHint: string;
    backHome: string;
    backStep: string;
    ticketLabel: string;
    ticketAria: string; // "… {n} / {max}"
    genSteps: [string, string, string, string, string, string];
    resEnter: string;
    resRegen: string; // "… {n} …"
    resRegenLocked: string;
    resReselect: string;
    nameTitle: string;
    nameSub: string;
    namePlaceholder: string;
    nameSubmit: string;
    nameSubmitting: string;
    nameHint: string;
    nameErrDup: string;
    nameErrSave: string;
    errMsg: string;
    errRetry: string;
    errBack: string;
    genTicketExhausted: string;
    genNoSession: string;
    genGeneric: string;
  };
};

const ko: OnboardingCopy = {
  login: {
    title: "돌아왔어",
    sub: "내 작은 세계로 들어가기.",
    email: "이메일",
    password: "비밀번호",
    submit: "로그인",
    submitting: "들어가는 중…",
    noAccount: "아직 계정이 없어?",
    signupLink: "가입하기",
    errBadCreds: "이메일이나 비밀번호가 안 맞아.",
    errUnconfirmed: "이메일 확인이 필요해.",
  },
  signup: {
    title: "작은 세계를 만들자",
    sub: "이메일로 가입해 내 광장을 가져.",
    email: "이메일",
    password: "비밀번호 (6자 이상)",
    passwordConfirm: "비밀번호 확인",
    submit: "가입하기",
    submitting: "만드는 중…",
    haveAccount: "이미 계정이 있어?",
    loginLink: "로그인",
    errShortPw: "비밀번호는 6자 이상이어야 해.",
    errMismatch: "비밀번호가 일치하지 않아.",
    confirmSent: "이메일 확인 메일을 보냈어. 링크 클릭 후 로그인해줘.",
    errEmailTaken: "이미 가입된 이메일이야. 로그인해줘.",
    errPwShort: "비밀번호가 너무 짧아 (6자 이상).",
    errBadEmail: "이메일 형식이 이상해.",
  },
  start: {
    codeTitle: "초대코드",
    codeSub: "초대받은 코드를 입력해주세요.",
    codePlaceholder: "ABCD2345",
    codeInvalid: "초대코드가 올바르지 않거나 이미 사용됐어요.",
    nameTitle: "광장 이름",
    nameSub: "당신의 광장을 뭐라고 부를까요? (1~16자)",
    namePlaceholder: "예: 새벽 광장",
    nameInvalid: "방 이름은 1~16자.",
    next: "다음",
    back: "뒤로",
    haveAccount: "이미 계정이 있어요",
    netErr: "네트워크 오류. 다시 시도해주세요.",
    finalizeFail: "확정 실패",
    codeConsumed: "초대코드가 방금 소진됐어요. 다른 코드로 다시 시도해주세요.",
    noSession: "세션이 없습니다.",
    okTitle: "환영합니다",
    okBody: "이제 당신만의 광장을 만들어 봅시다.",
    okCta: "시작하기",
    failTitle: "초대코드를 확인해주세요",
    failBody: "코드가 올바르지 않거나 이미 사용됐어요.",
    failCta: "다시 입력",
  },
  auth: {
    signupTitle: "가입하고 시작하기",
    loginTitle: "로그인",
    google: "Google로 계속하기",
    email: "이메일",
    passwordPlaceholder: "비밀번호 (6자 이상)",
    confirmSent: "이메일 확인 메일을 보냈어. 링크 클릭 후 로그인하면 이어집니다.",
    signupBtn: "가입",
    loginBtn: "로그인",
    toLogin: "이미 계정이 있어요",
    toSignup: "처음이에요 — 가입",
    working: "광장을 준비하는 중…",
    googleGoing: "Google로 이동 중…",
  },
  callback: {
    entering: "들어가는 중…",
    failed: "로그인을 완료하지 못했어요.",
  },
  invite: {
    title: "초대",
    status: "{used}/{total} 사용됨",
    copy: "복사",
    copied: "복사됨",
    used: "사용됨",
  },
  character: {
    selTitle: "어떤 모습으로 머무를까요",
    selSub: "여섯 가지 항목으로 결을 잡아요.",
    secGender: "성별",
    secSkin: "피부톤",
    secHair: "머리",
    secHairColor: "머리색",
    secOutfit: "착장",
    secAccessory: "장신구",
    plazaLang: "광장 언어",
    plazaLangDesc: "머무는 사람들의 언어 · 나중에 광장 설정에서 바꿀 수 있어요",
    createBtn: "내 캐릭터 만들기 · 티켓 {n}장",
    createBtnExhausted: "티켓 소진 (결과 중 하나 선택)",
    selHint: "이미지 생성엔 약 30초 · 다시 고르기 포함 총 3번까지 시도",
    backHome: "← 홈으로",
    backStep: "← 뒤로",
    ticketLabel: "티켓",
    ticketAria: "남은 티켓 {n}장 / {max}",
    genSteps: [
      "캔버스에 자리를 잡는 중",
      "전체 골격을 세우는 중",
      "피부 톤을 입히는 중",
      "어울리는 옷을 골라 입히는 중",
      "머리 모양을 정하는 중",
      "마지막 디테일을 다듬는 중",
    ],
    resEnter: "이 모습으로 들어가기",
    resRegen: "다시 만들기 · {n}번 남음",
    resRegenLocked: "티켓으로 한 번 더 (잠금)",
    resReselect: "다시 고르기",
    nameTitle: "어떻게 불릴까요",
    nameSub: "세계에서 당신을 부르는 이름. 1–12자.",
    namePlaceholder: "이름…",
    nameSubmit: "이 이름으로 들어가기",
    nameSubmitting: "들어가는 중…",
    nameHint: "이름은 나중에 설정에서 바꿀 수 있어요",
    nameErrDup: "이미 누군가 쓰고 있어요",
    nameErrSave: "지금은 저장이 어려워요",
    errMsg: "지금은 잘 안 만들어져요.",
    errRetry: "다시 시도",
    errBack: "돌아가기",
    genTicketExhausted: "이번 라운드 티켓을 다 썼어요. 결과 중에서 골라주세요.",
    genNoSession: "세션 없음 — 다시 로그인해줘",
    genGeneric: "오류",
  },
};

const en: OnboardingCopy = {
  login: {
    title: "Welcome back",
    sub: "Step into your little world.",
    email: "Email",
    password: "Password",
    submit: "Log in",
    submitting: "Entering…",
    noAccount: "No account yet?",
    signupLink: "Sign up",
    errBadCreds: "Email or password doesn't match.",
    errUnconfirmed: "Please confirm your email first.",
  },
  signup: {
    title: "Make your little world",
    sub: "Sign up with email and claim your plaza.",
    email: "Email",
    password: "Password (6+ chars)",
    passwordConfirm: "Confirm password",
    submit: "Sign up",
    submitting: "Creating…",
    haveAccount: "Already have an account?",
    loginLink: "Log in",
    errShortPw: "Password must be at least 6 characters.",
    errMismatch: "Passwords don't match.",
    confirmSent: "Confirmation email sent. Click the link, then log in.",
    errEmailTaken: "That email is already registered. Please log in.",
    errPwShort: "Password is too short (6+ characters).",
    errBadEmail: "That email format looks off.",
  },
  start: {
    codeTitle: "Invite code",
    codeSub: "Enter the code you were invited with.",
    codePlaceholder: "ABCD2345",
    codeInvalid: "That invite code is invalid or already used.",
    nameTitle: "Plaza name",
    nameSub: "What should we call your plaza? (1–16 chars)",
    namePlaceholder: "e.g. Dawn Plaza",
    nameInvalid: "Plaza name must be 1–16 characters.",
    next: "Next",
    back: "Back",
    haveAccount: "I already have an account",
    netErr: "Network error. Please try again.",
    finalizeFail: "Couldn't finish setup",
    codeConsumed: "That invite code was just used up. Try another code.",
    noSession: "No session.",
    okTitle: "Welcome",
    okBody: "Now let's build a plaza that's all your own.",
    okCta: "Let's begin",
    failTitle: "Check your invite code",
    failBody: "That code is invalid or already used.",
    failCta: "Try again",
  },
  auth: {
    signupTitle: "Sign up to start",
    loginTitle: "Log in",
    google: "Continue with Google",
    email: "Email",
    passwordPlaceholder: "Password (6+ chars)",
    confirmSent: "Confirmation email sent. Click the link, then log in to continue.",
    signupBtn: "Sign up",
    loginBtn: "Log in",
    toLogin: "I already have an account",
    toSignup: "First time — sign up",
    working: "Preparing your plaza…",
    googleGoing: "Going to Google…",
  },
  callback: {
    entering: "Entering…",
    failed: "Couldn't complete the login.",
  },
  invite: {
    title: "Invites",
    status: "{used}/{total} used",
    copy: "Copy",
    copied: "Copied",
    used: "Used",
  },
  character: {
    selTitle: "How will you appear?",
    selSub: "Six choices set your vibe.",
    secGender: "Gender",
    secSkin: "Skin",
    secHair: "Hair",
    secHairColor: "Hair color",
    secOutfit: "Outfit",
    secAccessory: "Accessory",
    plazaLang: "Plaza language",
    plazaLangDesc: "The language of the people who stay · you can change it later in plaza settings",
    createBtn: "Create my character · {n} tickets",
    createBtnExhausted: "Tickets used up (pick one of the results)",
    selHint: "Generation takes about 30s · up to 3 tries including re-rolls",
    backHome: "← Home",
    backStep: "← Back",
    ticketLabel: "Tickets",
    ticketAria: "{n} of {max} tickets left",
    genSteps: [
      "Finding a spot on the canvas",
      "Setting up the frame",
      "Painting the skin tone",
      "Picking out an outfit",
      "Styling the hair",
      "Polishing the last details",
    ],
    resEnter: "Enter as this look",
    resRegen: "Make again · {n} left",
    resRegenLocked: "One more with a ticket (locked)",
    resReselect: "Reselect",
    nameTitle: "What's your name here?",
    nameSub: "The name this world calls you. 1–12 chars.",
    namePlaceholder: "Name…",
    nameSubmit: "Enter as this name",
    nameSubmitting: "Entering…",
    nameHint: "You can change your name later in settings",
    nameErrDup: "Someone's already using that",
    nameErrSave: "Couldn't save right now",
    errMsg: "It's not coming out well right now.",
    errRetry: "Try again",
    errBack: "Go back",
    genTicketExhausted: "You've used this round's tickets. Please pick from the results.",
    genNoSession: "No session — please log in again",
    genGeneric: "Error",
  },
};

const ja: OnboardingCopy = {
  login: {
    title: "おかえり",
    sub: "あなたの小さな世界へ。",
    email: "メール",
    password: "パスワード",
    submit: "ログイン",
    submitting: "入っています…",
    noAccount: "アカウントはまだ？",
    signupLink: "新規登録",
    errBadCreds: "メールかパスワードが違います。",
    errUnconfirmed: "メールの確認が必要です。",
  },
  signup: {
    title: "小さな世界をつくろう",
    sub: "メールで登録して、自分の広場を持とう。",
    email: "メール",
    password: "パスワード（6文字以上）",
    passwordConfirm: "パスワード確認",
    submit: "新規登録",
    submitting: "作成中…",
    haveAccount: "すでにアカウントが？",
    loginLink: "ログイン",
    errShortPw: "パスワードは6文字以上にしてください。",
    errMismatch: "パスワードが一致しません。",
    confirmSent: "確認メールを送りました。リンクをクリックしてからログインしてください。",
    errEmailTaken: "登録済みのメールです。ログインしてください。",
    errPwShort: "パスワードが短すぎます（6文字以上）。",
    errBadEmail: "メールの形式がおかしいようです。",
  },
  start: {
    codeTitle: "招待コード",
    codeSub: "招待されたコードを入力してください。",
    codePlaceholder: "ABCD2345",
    codeInvalid: "招待コードが正しくないか、すでに使われています。",
    nameTitle: "広場の名前",
    nameSub: "あなたの広場を何と呼びますか？（1〜16文字）",
    namePlaceholder: "例：夜明けの広場",
    nameInvalid: "広場の名前は1〜16文字です。",
    next: "次へ",
    back: "戻る",
    haveAccount: "すでにアカウントがあります",
    netErr: "ネットワークエラー。もう一度お試しください。",
    finalizeFail: "セットアップを完了できませんでした",
    codeConsumed: "招待コードが今しがた使い切られました。別のコードでお試しください。",
    noSession: "セッションがありません。",
    okTitle: "ようこそ",
    okBody: "さあ、あなただけの広場をつくりましょう。",
    okCta: "はじめる",
    failTitle: "招待コードをご確認ください",
    failBody: "コードが正しくないか、すでに使われています。",
    failCta: "もう一度",
  },
  auth: {
    signupTitle: "登録して始める",
    loginTitle: "ログイン",
    google: "Googleで続ける",
    email: "メール",
    passwordPlaceholder: "パスワード（6文字以上）",
    confirmSent: "確認メールを送りました。リンクをクリックしてログインすると続きます。",
    signupBtn: "登録",
    loginBtn: "ログイン",
    toLogin: "すでにアカウントがあります",
    toSignup: "はじめて — 登録",
    working: "広場を準備しています…",
    googleGoing: "Googleへ移動中…",
  },
  callback: {
    entering: "入っています…",
    failed: "ログインを完了できませんでした。",
  },
  invite: {
    title: "招待",
    status: "{used}/{total} 使用済み",
    copy: "コピー",
    copied: "コピー済み",
    used: "使用済み",
  },
  character: {
    selTitle: "どんな姿でいますか",
    selSub: "6つの項目で雰囲気を決めます。",
    secGender: "性別",
    secSkin: "肌の色",
    secHair: "髪型",
    secHairColor: "髪色",
    secOutfit: "服装",
    secAccessory: "小物",
    plazaLang: "広場の言語",
    plazaLangDesc: "ここに集う人々の言語 · あとで広場の設定から変えられます",
    createBtn: "キャラクターを作る · チケット{n}枚",
    createBtnExhausted: "チケット切れ（結果から1つ選んでください）",
    selHint: "生成に約30秒 · 選び直しを含め最大3回まで",
    backHome: "← ホームへ",
    backStep: "← 戻る",
    ticketLabel: "チケット",
    ticketAria: "残りチケット {n} / {max}",
    genSteps: [
      "キャンバスに位置を決めています",
      "全体の骨格を立てています",
      "肌の色をのせています",
      "似合う服を選んでいます",
      "髪型を決めています",
      "最後のディテールを整えています",
    ],
    resEnter: "この姿で入る",
    resRegen: "作り直す · 残り{n}回",
    resRegenLocked: "チケットでもう一度（ロック）",
    resReselect: "選び直す",
    nameTitle: "何と呼ばれますか",
    nameSub: "この世界であなたを呼ぶ名前。1〜12文字。",
    namePlaceholder: "名前…",
    nameSubmit: "この名前で入る",
    nameSubmitting: "入っています…",
    nameHint: "名前はあとで設定から変えられます",
    nameErrDup: "もう誰かが使っています",
    nameErrSave: "今は保存できませんでした",
    errMsg: "今はうまく作れません。",
    errRetry: "もう一度",
    errBack: "戻る",
    genTicketExhausted: "今回のチケットを使い切りました。結果から選んでください。",
    genNoSession: "セッションなし — もう一度ログインしてください",
    genGeneric: "エラー",
  },
};

export const ONBOARDING: Record<Locale, OnboardingCopy> = { ko, en, ja };

// Character-builder option labels, keyed by option id (prompts.ts keeps its
// Korean `label` as the ultimate fallback). The character page renders
// OPTION_LABELS[locale][opt.id] ?? opt.label.
export const OPTION_LABELS: Record<Locale, Record<string, string>> = {
  ko: {
    m: "남", f: "여", nb: "중성",
    porcelain: "백자", fair: "옅은", olive: "올리브", tan: "구릿빛", bronze: "브론즈", brown: "갈색", dark: "짙은",
    casual: "캐주얼", street: "스트릿", minimal: "미니멀", vintage: "빈티지", smart: "댄디", sporty: "스포티", punk: "펑크", artsy: "아티", cozy: "포근", preppy: "프레피",
    short: "짧음", medium: "단발", long: "길게", buzz: "삭발", ponytail: "포니", bun: "올림", curly: "곱슬", waves: "웨이브",
    black: "검정", blonde: "금발", dyed: "염색", gray: "회색",
    none: "없음", glasses: "안경", hat: "모자", earrings: "귀걸이", scarf: "스카프",
  },
  en: {
    m: "Male", f: "Female", nb: "Neutral",
    porcelain: "Porcelain", fair: "Fair", olive: "Olive", tan: "Tan", bronze: "Bronze", brown: "Brown", dark: "Dark",
    casual: "Casual", street: "Street", minimal: "Minimal", vintage: "Vintage", smart: "Dandy", sporty: "Sporty", punk: "Punk", artsy: "Artsy", cozy: "Cozy", preppy: "Preppy",
    short: "Short", medium: "Bob", long: "Long", buzz: "Buzz", ponytail: "Ponytail", bun: "Bun", curly: "Curly", waves: "Waves",
    black: "Black", blonde: "Blonde", dyed: "Dyed", gray: "Gray",
    none: "None", glasses: "Glasses", hat: "Hat", earrings: "Earrings", scarf: "Scarf",
  },
  ja: {
    m: "男性", f: "女性", nb: "中性",
    porcelain: "白磁", fair: "明るめ", olive: "オリーブ", tan: "小麦色", bronze: "ブロンズ", brown: "ブラウン", dark: "濃いめ",
    casual: "カジュアル", street: "ストリート", minimal: "ミニマル", vintage: "ヴィンテージ", smart: "ダンディ", sporty: "スポーティ", punk: "パンク", artsy: "アーティ", cozy: "ぬくもり", preppy: "プレッピー",
    short: "ショート", medium: "ボブ", long: "ロング", buzz: "丸刈り", ponytail: "ポニー", bun: "お団子", curly: "カール", waves: "ウェーブ",
    black: "黒", blonde: "金髪", dyed: "カラー", gray: "グレー",
    none: "なし", glasses: "メガネ", hat: "帽子", earrings: "ピアス", scarf: "スカーフ",
  },
};
