// src/app/components/data/directories.js
// ─────────────────────────────────────────────────────────────────────────────
// Real-world business directories / citation sources, grouped for the Step-3
// "Where are you listed?" multi-select. The user picks the directories their
// business already has a profile on; the report uses this to find citation gaps
// (NAP consistency, missing high-authority listings) and AI-citation coverage.
//
// Order = render order (grouped by relevance for an India + global SMB). Users
// can also add their own via the custom input, so this list is a strong default,
// not an exhaustive registry.
// ─────────────────────────────────────────────────────────────────────────────

export const DIRECTORY_GROUPS = [
  {
    label: "Maps & Core Profiles",
    items: [
      "Google Business Profile",
      "Bing Places",
      "Apple Business Connect",
      "Facebook Page",
      "Instagram Business",
      "LinkedIn Company Page",
    ],
  },
  {
    label: "India Local Directories",
    items: [
      "JustDial",
      "Sulekha",
      "IndiaMART",
      "TradeIndia",
      "Yellow Pages India",
      "AskLaila",
      "Grotal",
      "Get It (getit.in)",
      "ExportersIndia",
      "AmbitionBox",
    ],
  },
  {
    label: "Reviews & Trust",
    items: [
      "Trustpilot",
      "Yelp",
      "Glassdoor",
      "Sitejabber",
      "MouthShut",
      "Better Business Bureau (BBB)",
    ],
  },
  {
    label: "B2B, Agencies & SaaS",
    items: [
      "Clutch",
      "GoodFirms",
      "DesignRush",
      "The Manifest",
      "G2",
      "Capterra",
      "GetApp",
      "Software Advice",
      "TrustRadius",
      "Crunchbase",
      "Wellfound (AngelList)",
      "Product Hunt",
    ],
  },
  {
    label: "General Local Citations",
    items: [
      "Yellow Pages (YP.com)",
      "Foursquare",
      "Hotfrog",
      "Cylex",
      "Brownbook",
      "Manta",
      "MerchantCircle",
      "ChamberofCommerce.com",
      "Nextdoor",
    ],
  },
  {
    label: "Industry-Specific",
    items: [
      "TripAdvisor",
      "Zomato",
      "Swiggy",
      "Practo",
      "Lybrate",
      "Healthgrades",
      "Zocdoc",
      "Avvo",
      "Houzz",
      "Angi",
      "Thumbtack",
      "Urban Company",
      "99acres",
      "MagicBricks",
      "Zillow",
    ],
  },
];

// Flat list (deduped, in group order) for option rendering + validation.
export const BUSINESS_DIRECTORIES = DIRECTORY_GROUPS.flatMap((g) => g.items);
