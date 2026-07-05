"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import gsap from "gsap";
import type { Stargazer } from "@/lib/stargazers";
import { nameForIndex } from "@/lib/names";
import {
  TIER_BUILDING,
  TIER_COLOR,
  TIER_SIZE,
  deckRadius,
  resolveTier,
  type Tier,
} from "@/lib/rarity";
import { useI18n, type Locale, type MsgKey } from "@/lib/i18n";
import { CloseIcon, StarIcon } from "./Icons";
import { WOOD } from "./TrunkRings";

type FocusCopy = {
  rarity: string;
  details: string;
  profile: string;
  clickAgain: string;
  pressInfo: string;
  infoTitle: string;
  source: string;
  contributorBoost: string;
  profileRarity: string;
  fallbackRarity: string;
  island: string;
  github: string;
  house: string;
  rating: string;
  size: string;
  deck: string;
  building: string;
  houseIndex: string;
  commits: string;
  followers: string;
  unknown: string;
  yes: string;
  no: string;
  contributor: string;
  visualTraits: string;
  traitSize: string;
  traitFocus: string;
  closeFocus: string;
  closeDetails: string;
};

const BUILDING_LABEL = {
  en: { common: "Garden cottage", uncommon: "Market lodge", rare: "Forge house", legendary: "Grand hall" },
  de: { common: "Gartenhaus", uncommon: "Markthaus", rare: "Schmiedehaus", legendary: "Große Halle" },
  it: { common: "Casetta giardino", uncommon: "Loggia mercato", rare: "Casa forgia", legendary: "Grande sala" },
  es: { common: "Casa jardin", uncommon: "Puesto mercado", rare: "Casa forja", legendary: "Gran salon" },
  fr: { common: "Maison jardin", uncommon: "Loge marche", rare: "Maison forge", legendary: "Grand hall" },
  pt: { common: "Casa jardim", uncommon: "Loja mercado", rare: "Casa forja", legendary: "Grande salao" },
  nl: { common: "Tuin huisje", uncommon: "Markt lodge", rare: "Smederijhuis", legendary: "Grote hal" },
  pl: { common: "Domek ogrodowy", uncommon: "Dom targowy", rare: "Dom kuzni", legendary: "Wielka sala" },
  ru: { common: "Sadovyy dom", uncommon: "Rynochnyy dom", rare: "Dom kuzni", legendary: "Bolshoy zal" },
  tr: { common: "Bahce evi", uncommon: "Pazar evi", rare: "Demirci evi", legendary: "Buyuk salon" },
  zh: { common: "花园小屋", uncommon: "集市小屋", rare: "锻造屋", legendary: "大厅" },
  ja: { common: "庭の小屋", uncommon: "市場の家", rare: "鍛冶の家", legendary: "大広間" },
  ko: { common: "정원 오두막", uncommon: "시장 집", rare: "대장간 집", legendary: "대연회장" },
  hi: { common: "बगीचा कुटिया", uncommon: "बाज़ार घर", rare: "भट्ठी घर", legendary: "महान हॉल" },
  ar: { common: "كوخ الحديقة", uncommon: "بيت السوق", rare: "بيت الحدادة", legendary: "القاعة الكبرى" },
} satisfies Record<Locale, Record<Tier, string>>;

const RATING_BASE: Record<Tier, number> = {
  common: 62,
  uncommon: 76,
  rare: 89,
  legendary: 97,
};

const COPY = {
  en: {
    rarity: "Rarity",
    details: "Details",
    profile: "Profile",
    clickAgain: "Click the house again to open GitHub",
    pressInfo: "Press I for full house intel",
    infoTitle: "House intel",
    source: "Rarity source",
    contributorBoost: "Contributor boost",
    profileRarity: "GitHub profile score",
    fallbackRarity: "Seeded village rarity",
    island: "Island",
    github: "GitHub",
    house: "House",
    rating: "Island rating",
    size: "Size",
    deck: "Deck radius",
    building: "Building",
    houseIndex: "House index",
    commits: "Commits",
    followers: "Followers",
    unknown: "not loaded",
    yes: "yes",
    no: "no",
    contributor: "Contributor",
    visualTraits: "Visual traits",
    traitSize: "Higher rarity gets a larger house, wider deck and stronger glow.",
    traitFocus: "The camera orbit target is pinned to this exact house while focused.",
    closeFocus: "Clear house focus",
    closeDetails: "Close house details",
  },
  de: {
    rarity: "Seltenheit",
    details: "Details",
    profile: "Profil",
    clickAgain: "Klick das Haus nochmal, um GitHub zu öffnen",
    pressInfo: "Drück I für komplette Haus-Infos",
    infoTitle: "Haus-Infos",
    source: "Rarity-Quelle",
    contributorBoost: "Contributor-Boost",
    profileRarity: "GitHub-Profilwertung",
    fallbackRarity: "Gesetzte Village-Rarity",
    island: "Insel",
    github: "GitHub",
    house: "Haus",
    rating: "Insel-Rating",
    size: "Größe",
    deck: "Deck-Radius",
    building: "Gebäude",
    houseIndex: "Hausnummer",
    commits: "Commits",
    followers: "Follower",
    unknown: "nicht geladen",
    yes: "ja",
    no: "nein",
    contributor: "Contributor",
    visualTraits: "Visuelle Merkmale",
    traitSize: "Höhere Rarity bekommt größeres Haus, breiteres Deck und stärkeren Glow.",
    traitFocus: "Die Kamera rotiert im Fokus exakt um dieses Haus.",
    closeFocus: "Haus-Fokus löschen",
    closeDetails: "Haus-Infos schließen",
  },
  it: {
    rarity: "Rarita",
    details: "Dettagli",
    profile: "Profilo",
    clickAgain: "Clicca di nuovo la casa per aprire GitHub",
    pressInfo: "Premi I per tutte le informazioni della casa",
    infoTitle: "Info casa",
    source: "Fonte rarita",
    contributorBoost: "Bonus contributor",
    profileRarity: "Punteggio profilo GitHub",
    fallbackRarity: "Rarita village seed",
    island: "Isola",
    github: "GitHub",
    house: "Casa",
    rating: "Rating isola",
    size: "Dimensione",
    deck: "Raggio deck",
    building: "Edificio",
    houseIndex: "Numero casa",
    commits: "Commit",
    followers: "Follower",
    unknown: "non caricato",
    yes: "si",
    no: "no",
    contributor: "Contributor",
    visualTraits: "Tratti visivi",
    traitSize: "Una rarita piu alta ottiene casa piu grande, deck piu largo e glow piu forte.",
    traitFocus: "La camera orbita esattamente intorno a questa casa quando e a fuoco.",
    closeFocus: "Cancella focus casa",
    closeDetails: "Chiudi dettagli casa",
  },
  es: {
    rarity: "Rareza",
    details: "Detalles",
    profile: "Perfil",
    clickAgain: "Haz clic otra vez en la casa para abrir GitHub",
    pressInfo: "Pulsa I para ver toda la informacion de la casa",
    infoTitle: "Info de casa",
    source: "Fuente de rareza",
    contributorBoost: "Bonus contributor",
    profileRarity: "Puntuacion del perfil GitHub",
    fallbackRarity: "Rareza village seed",
    island: "Isla",
    github: "GitHub",
    house: "Casa",
    rating: "Rating de isla",
    size: "Tamano",
    deck: "Radio del deck",
    building: "Edificio",
    houseIndex: "Numero de casa",
    commits: "Commits",
    followers: "Seguidores",
    unknown: "no cargado",
    yes: "si",
    no: "no",
    contributor: "Contributor",
    visualTraits: "Rasgos visuales",
    traitSize: "Mas rareza da una casa mas grande, deck mas ancho y glow mas fuerte.",
    traitFocus: "La camara orbita exactamente esta casa mientras esta enfocada.",
    closeFocus: "Quitar foco de casa",
    closeDetails: "Cerrar detalles de casa",
  },
  fr: {
    rarity: "Rarete",
    details: "Details",
    profile: "Profil",
    clickAgain: "Clique encore sur la maison pour ouvrir GitHub",
    pressInfo: "Appuie sur I pour toutes les infos maison",
    infoTitle: "Infos maison",
    source: "Source de rarete",
    contributorBoost: "Bonus contributor",
    profileRarity: "Score du profil GitHub",
    fallbackRarity: "Rarete village seed",
    island: "Ile",
    github: "GitHub",
    house: "Maison",
    rating: "Rating ile",
    size: "Taille",
    deck: "Rayon du deck",
    building: "Batiment",
    houseIndex: "Numero maison",
    commits: "Commits",
    followers: "Followers",
    unknown: "non charge",
    yes: "oui",
    no: "non",
    contributor: "Contributor",
    visualTraits: "Traits visuels",
    traitSize: "Une rarete plus haute donne une maison plus grande, un deck plus large et un glow plus fort.",
    traitFocus: "La camera orbite exactement autour de cette maison en focus.",
    closeFocus: "Effacer le focus maison",
    closeDetails: "Fermer les infos maison",
  },
  pt: {
    rarity: "Raridade",
    details: "Detalhes",
    profile: "Perfil",
    clickAgain: "Clique na casa outra vez para abrir GitHub",
    pressInfo: "Pressione I para ver tudo da casa",
    infoTitle: "Info da casa",
    source: "Fonte da raridade",
    contributorBoost: "Bonus contributor",
    profileRarity: "Pontuacao do perfil GitHub",
    fallbackRarity: "Raridade village seed",
    island: "Ilha",
    github: "GitHub",
    house: "Casa",
    rating: "Rating da ilha",
    size: "Tamanho",
    deck: "Raio do deck",
    building: "Edificio",
    houseIndex: "Numero da casa",
    commits: "Commits",
    followers: "Seguidores",
    unknown: "nao carregado",
    yes: "sim",
    no: "nao",
    contributor: "Contributor",
    visualTraits: "Tracos visuais",
    traitSize: "Raridade maior ganha casa maior, deck mais largo e glow mais forte.",
    traitFocus: "A camera orbita exatamente esta casa durante o foco.",
    closeFocus: "Limpar foco da casa",
    closeDetails: "Fechar detalhes da casa",
  },
  nl: {
    rarity: "Zeldzaamheid",
    details: "Details",
    profile: "Profiel",
    clickAgain: "Klik nogmaals op het huis om GitHub te openen",
    pressInfo: "Druk op I voor alle huisinfo",
    infoTitle: "Huisinfo",
    source: "Bron zeldzaamheid",
    contributorBoost: "Contributor-boost",
    profileRarity: "GitHub-profielscore",
    fallbackRarity: "Village seed zeldzaamheid",
    island: "Eiland",
    github: "GitHub",
    house: "Huis",
    rating: "Eilandrating",
    size: "Grootte",
    deck: "Deckradius",
    building: "Gebouw",
    houseIndex: "Huisnummer",
    commits: "Commits",
    followers: "Volgers",
    unknown: "niet geladen",
    yes: "ja",
    no: "nee",
    contributor: "Contributor",
    visualTraits: "Visuele kenmerken",
    traitSize: "Hogere zeldzaamheid krijgt een groter huis, breder deck en sterkere glow.",
    traitFocus: "De camera draait in focus exact rond dit huis.",
    closeFocus: "Huisfocus wissen",
    closeDetails: "Huisdetails sluiten",
  },
  pl: {
    rarity: "Rzadkosc",
    details: "Szczegoly",
    profile: "Profil",
    clickAgain: "Kliknij dom ponownie, aby otworzyc GitHub",
    pressInfo: "Nacisnij I, aby zobaczyc pelne info domu",
    infoTitle: "Info domu",
    source: "Zrodlo rzadkosci",
    contributorBoost: "Bonus contributor",
    profileRarity: "Wynik profilu GitHub",
    fallbackRarity: "Rzadkosc village seed",
    island: "Wyspa",
    github: "GitHub",
    house: "Dom",
    rating: "Ocena wyspy",
    size: "Rozmiar",
    deck: "Promien decku",
    building: "Budynek",
    houseIndex: "Numer domu",
    commits: "Commity",
    followers: "Obserwujacy",
    unknown: "nie zaladowano",
    yes: "tak",
    no: "nie",
    contributor: "Contributor",
    visualTraits: "Cechy wizualne",
    traitSize: "Wyższa rzadkosc daje wiekszy dom, szerszy deck i mocniejszy glow.",
    traitFocus: "Kamera obraca sie dokladnie wokol tego domu w trybie focus.",
    closeFocus: "Wyczysc focus domu",
    closeDetails: "Zamknij szczegoly domu",
  },
  ru: {
    rarity: "Redkost",
    details: "Detali",
    profile: "Profil",
    clickAgain: "Kliknite po domu eshche raz, chtoby otkryt GitHub",
    pressInfo: "Nazhmite I, chtoby otkryt vse dannye doma",
    infoTitle: "Info doma",
    source: "Istochnik redkosti",
    contributorBoost: "Bonus contributor",
    profileRarity: "Otsenka profilya GitHub",
    fallbackRarity: "Redkost village seed",
    island: "Ostrov",
    github: "GitHub",
    house: "Dom",
    rating: "Reyting ostrova",
    size: "Razmer",
    deck: "Radius deka",
    building: "Zdanie",
    houseIndex: "Nomer doma",
    commits: "Commity",
    followers: "Podpischiki",
    unknown: "ne zagruzheno",
    yes: "da",
    no: "net",
    contributor: "Contributor",
    visualTraits: "Vizualnye cherty",
    traitSize: "Bolee vysokaya redkost daet bolshiy dom, shire dek i silnee glow.",
    traitFocus: "Kamera v fokuse vrashchaetsya tochno vokrug etogo doma.",
    closeFocus: "Sbrosit fokus doma",
    closeDetails: "Zakryt detali doma",
  },
  tr: {
    rarity: "Nadirlik",
    details: "Detaylar",
    profile: "Profil",
    clickAgain: "GitHub acmak icin eve tekrar tikla",
    pressInfo: "Tum ev bilgileri icin I tusuna bas",
    infoTitle: "Ev bilgisi",
    source: "Nadirlik kaynagi",
    contributorBoost: "Contributor bonusu",
    profileRarity: "GitHub profil puani",
    fallbackRarity: "Village seed nadirligi",
    island: "Ada",
    github: "GitHub",
    house: "Ev",
    rating: "Ada puani",
    size: "Boyut",
    deck: "Deck yaricapi",
    building: "Yapi",
    houseIndex: "Ev numarasi",
    commits: "Commitler",
    followers: "Takipciler",
    unknown: "yuklenmedi",
    yes: "evet",
    no: "hayir",
    contributor: "Contributor",
    visualTraits: "Gorsel ozellikler",
    traitSize: "Daha yuksek nadirlik daha buyuk ev, daha genis deck ve daha guclu glow verir.",
    traitFocus: "Kamera focus modunda tam olarak bu evin etrafinda doner.",
    closeFocus: "Ev focusunu temizle",
    closeDetails: "Ev detaylarini kapat",
  },
  zh: {
    rarity: "稀有度",
    details: "详情",
    profile: "资料",
    clickAgain: "再次点击房屋即可打开 GitHub",
    pressInfo: "按 I 查看完整房屋信息",
    infoTitle: "房屋信息",
    source: "稀有度来源",
    contributorBoost: "贡献者加成",
    profileRarity: "GitHub 资料评分",
    fallbackRarity: "村庄种子稀有度",
    island: "岛屿",
    github: "GitHub",
    house: "房屋",
    rating: "岛屿评分",
    size: "尺寸",
    deck: "平台半径",
    building: "建筑",
    houseIndex: "房屋编号",
    commits: "提交",
    followers: "关注者",
    unknown: "未加载",
    yes: "是",
    no: "否",
    contributor: "贡献者",
    visualTraits: "视觉特征",
    traitSize: "稀有度越高，房屋越大，平台越宽，光效越强。",
    traitFocus: "聚焦时相机会精确围绕这座房屋旋转。",
    closeFocus: "清除房屋焦点",
    closeDetails: "关闭房屋详情",
  },
  ja: {
    rarity: "レア度",
    details: "詳細",
    profile: "プロフィール",
    clickAgain: "家をもう一度クリックすると GitHub を開きます",
    pressInfo: "I キーで家の詳細情報を表示",
    infoTitle: "家の情報",
    source: "レア度の根拠",
    contributorBoost: "Contributor ボーナス",
    profileRarity: "GitHub プロフィール評価",
    fallbackRarity: "Village seed レア度",
    island: "島",
    github: "GitHub",
    house: "家",
    rating: "島の評価",
    size: "サイズ",
    deck: "デッキ半径",
    building: "建物",
    houseIndex: "家番号",
    commits: "コミット",
    followers: "フォロワー",
    unknown: "未読み込み",
    yes: "はい",
    no: "いいえ",
    contributor: "Contributor",
    visualTraits: "見た目の特徴",
    traitSize: "レア度が高いほど家が大きく、デッキが広く、光が強くなります。",
    traitFocus: "フォーカス中はカメラがこの家を中心に正確に回転します。",
    closeFocus: "家フォーカスを解除",
    closeDetails: "家の詳細を閉じる",
  },
  ko: {
    rarity: "희귀도",
    details: "상세",
    profile: "프로필",
    clickAgain: "집을 다시 클릭하면 GitHub가 열립니다",
    pressInfo: "I 키로 집 전체 정보를 엽니다",
    infoTitle: "집 정보",
    source: "희귀도 출처",
    contributorBoost: "Contributor 보너스",
    profileRarity: "GitHub 프로필 점수",
    fallbackRarity: "Village seed 희귀도",
    island: "섬",
    github: "GitHub",
    house: "집",
    rating: "섬 평점",
    size: "크기",
    deck: "데크 반경",
    building: "건물",
    houseIndex: "집 번호",
    commits: "커밋",
    followers: "팔로워",
    unknown: "로드 안 됨",
    yes: "예",
    no: "아니오",
    contributor: "Contributor",
    visualTraits: "시각 특징",
    traitSize: "희귀도가 높을수록 집이 커지고 데크가 넓어지며 glow가 강해집니다.",
    traitFocus: "포커스 중에는 카메라가 이 집을 정확히 중심으로 회전합니다.",
    closeFocus: "집 포커스 지우기",
    closeDetails: "집 상세 닫기",
  },
  hi: {
    rarity: "दुर्लभता",
    details: "विवरण",
    profile: "प्रोफाइल",
    clickAgain: "GitHub खोलने के लिए घर पर फिर क्लिक करें",
    pressInfo: "पूरी घर जानकारी के लिए I दबाएं",
    infoTitle: "घर जानकारी",
    source: "दुर्लभता स्रोत",
    contributorBoost: "Contributor बोनस",
    profileRarity: "GitHub प्रोफाइल स्कोर",
    fallbackRarity: "Village seed दुर्लभता",
    island: "द्वीप",
    github: "GitHub",
    house: "घर",
    rating: "द्वीप रेटिंग",
    size: "आकार",
    deck: "डेक त्रिज्या",
    building: "इमारत",
    houseIndex: "घर नंबर",
    commits: "कमिट",
    followers: "फॉलोअर",
    unknown: "लोड नहीं हुआ",
    yes: "हां",
    no: "नहीं",
    contributor: "Contributor",
    visualTraits: "दृश्य गुण",
    traitSize: "ज्यादा दुर्लभता से बड़ा घर, चौड़ा डेक और मजबूत glow मिलता है.",
    traitFocus: "फोकस में कैमरा इसी घर के चारों ओर सटीक घूमता है.",
    closeFocus: "घर फोकस हटाएं",
    closeDetails: "घर विवरण बंद करें",
  },
  ar: {
    rarity: "الندرة",
    details: "التفاصيل",
    profile: "الملف",
    clickAgain: "انقر على البيت مرة أخرى لفتح GitHub",
    pressInfo: "اضغط I لعرض كل معلومات البيت",
    infoTitle: "معلومات البيت",
    source: "مصدر الندرة",
    contributorBoost: "تعزيز المساهم",
    profileRarity: "تقييم ملف GitHub",
    fallbackRarity: "ندرة village seed",
    island: "الجزيرة",
    github: "GitHub",
    house: "البيت",
    rating: "تقييم الجزيرة",
    size: "الحجم",
    deck: "نصف قطر المنصة",
    building: "المبنى",
    houseIndex: "رقم البيت",
    commits: "Commits",
    followers: "المتابعون",
    unknown: "غير محمل",
    yes: "نعم",
    no: "لا",
    contributor: "مساهم",
    visualTraits: "السمات البصرية",
    traitSize: "الندرة الأعلى تمنح بيتا أكبر ومنصة أوسع وتوهجا أقوى.",
    traitFocus: "عند التركيز تدور الكاميرا حول هذا البيت بدقة.",
    closeFocus: "مسح تركيز البيت",
    closeDetails: "إغلاق تفاصيل البيت",
  },
} satisfies Record<Locale, FocusCopy>;

const panelStyle = {
  borderColor: WOOD.barkDark,
  background: `radial-gradient(circle at 42% 22%, ${WOOD.woodMid}, ${WOOD.woodDeep} 55%, ${WOOD.barkMid} 82%, ${WOOD.barkDark})`,
  boxShadow:
    "inset 0 1px 0 rgba(255,232,190,0.2), inset 0 -18px 28px rgba(0,0,0,0.2), 0 18px 50px rgba(0,0,0,0.55)",
} as const;

const insetStyle = {
  borderColor: "rgba(20,12,4,0.82)",
  background: "linear-gradient(180deg, rgba(14,8,2,0.54), rgba(24,15,6,0.34))",
  boxShadow: "inset 0 2px 8px rgba(0,0,0,0.5), 0 1px 0 rgba(201,168,110,0.12)",
} as const;

type BadgeAccent = {
  color: string;
  border: string;
  background: string;
  shadow: string;
};

const TIER_ACCENT: Record<Tier, BadgeAccent> = {
  common: {
    color: "#e4ebe6",
    border: "rgba(186, 201, 193, 0.52)",
    background: "linear-gradient(135deg, rgba(154,166,160,0.34), rgba(44,55,49,0.72))",
    shadow: "0 0 16px rgba(154,166,160,0.18)",
  },
  uncommon: {
    color: "#c8ffbe",
    border: "rgba(118, 226, 120, 0.62)",
    background: "linear-gradient(135deg, rgba(93,190,99,0.46), rgba(24,75,43,0.76))",
    shadow: "0 0 18px rgba(101,220,99,0.26)",
  },
  rare: {
    color: "#d8ecff",
    border: "rgba(94, 165, 255, 0.68)",
    background: "linear-gradient(135deg, rgba(74,143,224,0.52), rgba(26,55,105,0.78))",
    shadow: "0 0 20px rgba(74,143,224,0.3)",
  },
  legendary: {
    color: "#fff1b8",
    border: "rgba(255, 190, 86, 0.78)",
    background: "linear-gradient(135deg, rgba(255,198,92,0.62), rgba(139,78,19,0.76) 54%, rgba(68,37,9,0.88))",
    shadow: "0 0 24px rgba(255,180,58,0.38), inset 0 1px 0 rgba(255,245,190,0.28)",
  },
};

const CONTRIBUTOR_ACCENT: BadgeAccent = {
  color: "#f5ffd4",
  border: "rgba(170, 236, 104, 0.78)",
  background: "linear-gradient(135deg, rgba(153,224,83,0.62), rgba(41,120,62,0.78) 58%, rgba(28,64,45,0.9))",
  shadow: "0 0 22px rgba(150,235,83,0.34), inset 0 1px 0 rgba(244,255,204,0.25)",
};

function badgeStyle(accent: BadgeAccent): CSSProperties {
  return {
    color: accent.color,
    borderColor: accent.border,
    background: accent.background,
    boxShadow: accent.shadow,
    textShadow: "0 1px 2px rgba(0,0,0,0.55)",
  };
}

function primaryButtonStyle(tier: Tier, contributor: boolean): CSSProperties {
  return {
    borderColor: contributor ? CONTRIBUTOR_ACCENT.border : WOOD.barkDark,
    background: contributor
      ? `linear-gradient(135deg, ${TIER_COLOR[tier]} 0%, #e7b75d 43%, #93dc62 100%)`
      : `linear-gradient(180deg, ${TIER_COLOR[tier]}, ${WOOD.woodMid})`,
    color: WOOD.barkDark,
    boxShadow: contributor
      ? "0 0 22px rgba(154,222,94,0.22), inset 0 1px 0 rgba(255,245,190,0.34)"
      : "inset 0 1px 0 rgba(255,232,190,0.24)",
  };
}

function numberOrDash(value: number | undefined, locale: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale).format(value);
}

function useHouseFacts(index: number, stargazer: Stargazer | null, stargazers: Stargazer[] | null) {
  const { locale, t } = useI18n();
  const copy = COPY[locale];
  const buildingLabels = BUILDING_LABEL[locale];
  return useMemo(() => {
    const tier = resolveTier(index, stargazers);
    const name = stargazer?.login ?? nameForIndex(index);
    const commits = stargazer?.commits ?? 0;
    const followers = stargazer?.followers;
    const contributor = Boolean(stargazer?.contributor);
    const rating = Math.min(
      100,
      Math.round(
        RATING_BASE[tier] +
          Math.min(5, Math.log10((followers ?? 0) + 1) * 1.7) +
          Math.min(4, commits * 0.18) +
          (contributor ? 3 : 0),
      ),
    );
    const source = contributor
      ? copy.contributorBoost
      : stargazer?.tier
        ? copy.profileRarity
        : copy.fallbackRarity;

    return {
      copy,
      tier,
      tierLabel: t(("tier." + tier) as MsgKey),
      color: TIER_COLOR[tier],
      name,
      profileUrl: stargazer?.profileUrl ?? `https://github.com/${name}`,
      contributor,
      commits,
      followers,
      rating,
      source,
      size: TIER_SIZE[tier],
      deck: deckRadius(index, stargazers),
      building: buildingLabels[tier] ?? TIER_BUILDING[tier],
      locale,
    };
  }, [buildingLabels, copy, index, locale, stargazer, stargazers, t]);
}

function FocusCard({
  index,
  stargazer,
  stargazers,
  onOpenInfo,
  onOpenProfile,
  onClearFocus,
}: {
  index: number;
  stargazer: Stargazer | null;
  stargazers: Stargazer[] | null;
  onOpenInfo: () => void;
  onOpenProfile: () => void;
  onClearFocus: () => void;
}) {
  const facts = useHouseFacts(index, stargazer, stargazers);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = root.querySelectorAll("[data-focus-item]");
    gsap.killTweensOf([root, ...Array.from(items)]);
    gsap.fromTo(
      root,
      { autoAlpha: 0, y: 16, scale: 0.965 },
      { autoAlpha: 1, y: 0, scale: 1, duration: reduced ? 0 : 0.34, ease: "back.out(1.45)" },
    );
    gsap.fromTo(
      items,
      { autoAlpha: 0, y: 8 },
      { autoAlpha: 1, y: 0, duration: reduced ? 0 : 0.24, stagger: 0.035, ease: "power2.out" },
    );
  }, [index]);

  return (
    <aside
      ref={rootRef}
      className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-3 z-30 w-[min(360px,calc(100vw-1.5rem))] rounded-2xl border p-3 text-left opacity-0 sm:left-5 sm:p-4"
      style={panelStyle}
      aria-live="polite"
    >
      <div data-focus-item className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="mb-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase"
            style={badgeStyle(TIER_ACCENT[facts.tier])}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: facts.color }} />
            {facts.tierLabel}
          </div>
          <h2 className="truncate text-[17px] font-black leading-tight" style={{ color: WOOD.text }}>
            {facts.name}
          </h2>
          <p className="mt-1 text-[11px] leading-snug" style={{ color: WOOD.textDim }}>
            {facts.copy.clickAgain}
          </p>
        </div>
        <button
          type="button"
          onClick={onClearFocus}
          aria-label={facts.copy.closeFocus}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border transition hover:brightness-110 active:scale-95"
          style={{ ...insetStyle, color: WOOD.textDim }}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div data-focus-item className="mt-3 grid grid-cols-3 gap-2">
        {[
          [facts.copy.rating, `${facts.rating}%`],
          [facts.copy.houseIndex, `#${index + 1}`],
          [facts.copy.commits, numberOrDash(facts.commits, facts.locale)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border px-2 py-2" style={insetStyle}>
            <div className="truncate text-[9px] font-bold uppercase" style={{ color: WOOD.textDim }}>
              {label}
            </div>
            <div className="mt-0.5 truncate text-[13px] font-black tabular-nums" style={{ color: WOOD.text }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div data-focus-item className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-black transition hover:brightness-110 active:scale-[0.98]"
          style={primaryButtonStyle(facts.tier, facts.contributor)}
        >
          <StarIcon className="h-3.5 w-3.5" />
          {facts.copy.profile}
        </button>
        <button
          type="button"
          onClick={onOpenInfo}
          className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-black transition hover:brightness-110 active:scale-[0.98]"
          style={{ ...insetStyle, color: WOOD.accent }}
        >
          <span className="grid h-5 w-5 place-items-center rounded-md border text-[11px]" style={insetStyle}>
            I
          </span>
          {facts.copy.details}
        </button>
      </div>

      <p data-focus-item className="mt-2 text-[10.5px]" style={{ color: WOOD.textDim }}>
        {facts.copy.pressInfo}
      </p>
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2" style={insetStyle}>
      <span className="min-w-0 truncate text-[11px] font-bold uppercase" style={{ color: WOOD.textDim }}>
        {label}
      </span>
      <span className="min-w-0 break-words text-right text-[12.5px] font-black" style={{ color: WOOD.text }}>
        {value}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: WOOD.ringLight }}>
        {children}
      </span>
      <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${WOOD.ringDark}aa, transparent)` }} />
    </div>
  );
}

function HouseInfoPanel({
  index,
  stargazer,
  stargazers,
  onClose,
  onOpenProfile,
}: {
  index: number;
  stargazer: Stargazer | null;
  stargazers: Stargazer[] | null;
  onClose: () => void;
  onOpenProfile: () => void;
}) {
  const facts = useHouseFacts(index, stargazer, stargazers);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = panel.querySelectorAll("[data-info-item]");
    const tl = gsap.timeline();
    tl.fromTo(
      overlay,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: reduced ? 0 : 0.18, ease: "power2.out" },
    )
      .fromTo(
        panel,
        { autoAlpha: 0, y: 18, scale: 0.965, rotateX: -3 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          rotateX: 0,
          duration: reduced ? 0 : 0.36,
          ease: "back.out(1.35)",
        },
        0.02,
      )
      .fromTo(
        items,
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: reduced ? 0 : 0.24, stagger: 0.025, ease: "power2.out" },
        "-=0.16",
      );
    return () => {
      tl.kill();
    };
  }, [index]);

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/20 p-3 opacity-0 sm:p-5 lg:justify-start lg:p-8"
      onClick={onClose}
    >
      <section
        ref={panelRef}
        className="flex max-h-[86dvh] w-full max-w-[860px] flex-col overflow-hidden rounded-2xl border p-3 opacity-0 sm:p-4 lg:max-w-[760px]"
        style={panelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <header data-info-item className="flex items-start justify-between gap-3 border-b pb-3" style={{ borderColor: "rgba(20,12,4,0.55)" }}>
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: WOOD.ringLight }}>
              {facts.copy.infoTitle}
            </div>
            <h2 className="mt-1 truncate text-2xl font-black leading-tight" style={{ color: WOOD.text }}>
              {facts.name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-black uppercase">
              <span className="rounded-full border px-2 py-0.5" style={badgeStyle(TIER_ACCENT[facts.tier])}>
                {facts.tierLabel}
              </span>
              {facts.contributor && (
                <span className="rounded-full border px-2 py-0.5" style={badgeStyle(CONTRIBUTOR_ACCENT)}>
                  {facts.copy.contributor}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={facts.copy.closeDetails}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition hover:brightness-110 active:scale-95"
            style={{ ...insetStyle, color: WOOD.textDim }}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pt-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
            <section data-info-item className="space-y-3">
              <SectionTitle>{facts.copy.rarity}</SectionTitle>
              <div className="rounded-2xl border p-3" style={insetStyle}>
                <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase" style={{ color: WOOD.textDim }}>
                  <span>{facts.copy.rating}</span>
                  <span style={{ color: facts.color }}>{facts.rating}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/35">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${facts.rating}%`,
                      background: `linear-gradient(90deg, ${WOOD.woodLight}, ${facts.color})`,
                      boxShadow: `0 0 16px ${facts.color}66`,
                    }}
                  />
                </div>
              </div>
              <DetailRow label={facts.copy.source} value={facts.source} />
              <DetailRow label={facts.copy.visualTraits} value={facts.copy.traitSize} />
              <DetailRow label={facts.copy.houseIndex} value={`#${index + 1}`} />
            </section>

            <section data-info-item className="space-y-3">
              <SectionTitle>{facts.copy.island}</SectionTitle>
              <DetailRow label={facts.copy.building} value={facts.building} />
              <DetailRow label={facts.copy.size} value={`${facts.size.toFixed(2)}x`} />
              <DetailRow label={facts.copy.deck} value={facts.deck.toFixed(2)} />
              <DetailRow label={facts.copy.house} value={facts.copy.traitFocus} />
            </section>

            <section data-info-item className="space-y-3 lg:col-span-2">
              <SectionTitle>{facts.copy.github}</SectionTitle>
              <div className="grid gap-2 sm:grid-cols-3">
                <DetailRow label={facts.copy.contributor} value={facts.contributor ? facts.copy.yes : facts.copy.no} />
                <DetailRow label={facts.copy.commits} value={numberOrDash(facts.commits, facts.locale)} />
                <DetailRow
                  label={facts.copy.followers}
                  value={
                    typeof facts.followers === "number"
                      ? numberOrDash(facts.followers, facts.locale)
                      : facts.copy.unknown
                  }
                />
              </div>
              <button
                type="button"
                onClick={onOpenProfile}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[12px] font-black transition hover:brightness-110 active:scale-[0.99]"
                style={primaryButtonStyle(facts.tier, facts.contributor)}
              >
                <StarIcon className="h-4 w-4" />
                {facts.copy.profile}
              </button>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function HouseFocusUI({
  index,
  stargazer,
  stargazers,
  infoOpen,
  onOpenInfo,
  onCloseInfo,
  onOpenProfile,
  onClearFocus,
}: {
  index: number;
  stargazer: Stargazer | null;
  stargazers: Stargazer[] | null;
  infoOpen: boolean;
  onOpenInfo: () => void;
  onCloseInfo: () => void;
  onOpenProfile: () => void;
  onClearFocus: () => void;
}) {
  return (
    <>
      {!infoOpen && (
        <FocusCard
          index={index}
          stargazer={stargazer}
          stargazers={stargazers}
          onOpenInfo={onOpenInfo}
          onOpenProfile={onOpenProfile}
          onClearFocus={onClearFocus}
        />
      )}
      {infoOpen && (
        <HouseInfoPanel
          index={index}
          stargazer={stargazer}
          stargazers={stargazers}
          onClose={onCloseInfo}
          onOpenProfile={onOpenProfile}
        />
      )}
    </>
  );
}
