// ============================================================================
// UTOPIA FACTION QUIZ — all content lives here for easy editing.
// ----------------------------------------------------------------------------
// Faction copy, accent colors, and portraits are still placeholders — swap
// those for finals. Questions use the v3 book-accurate weights. The rest of the
// app reads from these three exports: FACTIONS, QUESTIONS, and the
// computeResult() helper. No other file needs to change for content.
// ============================================================================

export type FactionId =
  | "humanist"
  | "mason"
  | "mitsubishi"
  | "cousin"
  | "gordian"
  | "europe"
  | "utopian"
  | "delian"
  | "sensayer"
  | "whitelaw"
  | "greylaw"
  | "blacklaw"
  | "servicer"
  | "madames"
  | "setset";

export interface Accent {
  /** HSL components — kept as a tuple so the UI can derive tints/shades. */
  h: number;
  s: number;
  l: number;
}

export interface Faction {
  id: FactionId;
  name: string;
  tagline: string;
  description: string;
  accent: Accent;
  /** Optional portrait path (e.g. "/utopia/gordian.png"). Omit to render the placeholder. */
  image?: string;
}

export interface AnswerOption {
  text: string;
  /** Weighted points awarded to each faction when this option is chosen. */
  scores: Partial<Record<FactionId, number>>;
}

export interface Question {
  id: string;
  prompt: string;
  options: AnswerOption[];
}

// ----------------------------------------------------------------------------
// FACTIONS — placeholder copy. Replace name/tagline/description/image with finals.
// ----------------------------------------------------------------------------

export const FACTIONS: Faction[] = [
  {
    id: "humanist",
    image: "/utopia/humanist.png",
    name: "Humanist",
    tagline: "We are the makers and the meaning.",
    description:
      "You believe humanity is measured by what we create and feel. Art, empathy, and the individual soul are the true marks of progress.",
    accent: { h: 6, s: 75, l: 52 },
  },
  {
    id: "mason",
    image: "/utopia/mason.png",
    name: "Mason",
    tagline: "The universe is a problem worth solving.",
    description:
      "You find meaning in structure, proof, and the slow climb of understanding. Where others see chaos, you see systems waiting to be mapped.",
    accent: { h: 215, s: 35, l: 48 },
  },
  {
    id: "mitsubishi",
    image: "/utopia/mitsubishi.png",
    name: "Mitsubishi",
    tagline: "Roots before rooftops.",
    description:
      "You belong to land, season, and the long patience of growing things. The natural world is not a resource but a relative.",
    accent: { h: 145, s: 45, l: 40 },
  },
  {
    id: "cousin",
    image: "/utopia/cousin.png",
    name: "Cousin",
    tagline: "To tend the body is to tend the soul.",
    description:
      "You meet people at their most vulnerable and do not flinch. Healing, faith, and care are your currencies.",
    accent: { h: 270, s: 45, l: 52 },
  },
  {
    id: "gordian",
    image: "/utopia/gordian.png",
    name: "Gordian",
    tagline: "Cut the knot.",
    description:
      "You see the move no one else will make, and you make it without apology. Strategy is your native language.",
    accent: { h: 41, s: 80, l: 50 },
  },
  {
    id: "europe",
    image: "/utopia/europe.png",
    name: "Europe",
    tagline: "What is old has earned its place.",
    description:
      "You trust inheritance, ceremony, and the slow wisdom of institutions. The past is a draft, not a prison.",
    accent: { h: 222, s: 60, l: 48 },
  },
  {
    id: "utopian",
    image: "/utopia/utopian.png",
    name: "Utopian",
    tagline: "The horizon is a dare.",
    description:
      "You refuse to accept that this is all there is. The future belongs to those willing to chase it off-world.",
    accent: { h: 188, s: 75, l: 42 },
  },
  {
    id: "delian",
    image: "/utopia/delian.png",
    name: "Delian",
    tagline: "The center holds because we hold it.",
    description:
      "You believe in balance, moderation, and the unglamorous work of keeping a society standing.",
    accent: { h: 172, s: 50, l: 38 },
  },
  {
    id: "sensayer",
    image: "/utopia/sensayer.png",
    name: "Sensayer",
    tagline: "All beliefs are true from somewhere.",
    description:
      "You sit with uncertainty and make it your home. You counsel, you question, you hold the space between certainties.",
    accent: { h: 280, s: 40, l: 52 },
  },
  {
    id: "whitelaw",
    image: "/utopia/whitelaw.png",
    name: "Whitelaw",
    tagline: "The law is the law.",
    description:
      "You choose order over loophole, the letter over the escape hatch. Reliability is your quiet virtue.",
    accent: { h: 210, s: 18, l: 48 },
  },
  {
    id: "greylaw",
    image: "/utopia/greylaw.png",
    name: "Greylaw",
    tagline: "The rules bend; that's what rules are for.",
    description:
      "You live in the productive middle, where law meets latitude. Pragmatism over purity.",
    accent: { h: 220, s: 10, l: 46 },
  },
  {
    id: "blacklaw",
    image: "/utopia/blacklaw.png",
    name: "Blacklaw",
    tagline: "Freedom at any cost.",
    description:
      "You refuse any master, including your own caution. Absolute liberty is the only honest contract.",
    accent: { h: 210, s: 30, l: 22 },
  },
  {
    id: "servicer",
    image: "/utopia/servicer.png",
    name: "Servicer",
    tagline: "Service is the highest freedom.",
    description:
      "You find your highest self in service to others — debt paid in labor and love.",
    accent: { h: 34, s: 70, l: 46 },
  },
  {
    id: "madames",
    image: "/utopia/madames.png",
    name: "Madame's",
    tagline: "Embrace the animal.",
    description:
      "You know that humans are creatures of appetite, and you make peace with it. Pleasure, honesty, and the body.",
    accent: { h: 332, s: 60, l: 50 },
  },
  {
    id: "setset",
    image: "/utopia/setset.png",
    name: "Set-Set",
    tagline: "More input. More signal.",
    description:
      "You think in streams, feel in data, and dissolve the line between self and sensorium.",
    accent: { h: 295, s: 65, l: 50 },
  },
];

// ----------------------------------------------------------------------------
// QUESTIONS — v3 structure: 5 questions (Q3 is binary). Book-accurate weights.
// Each option awards weighted points to 1–2 factions; highest total wins.
// ----------------------------------------------------------------------------

export const QUESTIONS: Question[] = [
  {
    id: "good-time",
    prompt: "Your idea of a good time tonight",
    options: [
      {
        text: "Take the vow, chase the frontier, cash in your leisure for the stars.",
        scores: { utopian: 4, setset: 1 },
      },
      {
        text: "Hold court in the corner, quietly out-argue everyone in the room.",
        scores: { mason: 3, gordian: 1 },
      },
      {
        text: "Dance until someone cries laughing, surrounded by chosen family.",
        scores: { humanist: 3, madames: 1 },
      },
    ],
  },
  {
    id: "government",
    prompt: "Your ideal government",
    options: [
      {
        text: "Free people, no interference — live by your own code.",
        scores: { blacklaw: 4, greylaw: 1 },
      },
      {
        text: "Old houses, old rites, slow and careful stewardship.",
        scores: { europe: 3, delian: 1 },
      },
      {
        text: "Everyone fed, tended, and cared for by those who serve.",
        scores: { cousin: 3, servicer: 2 },
      },
    ],
  },
  {
    id: "trust",
    prompt: "You trust",
    options: [
      {
        text: "The data, even when it's uncomfortable.",
        scores: { setset: 3, mason: 1 },
      },
      {
        text: "Whoever's earned it through years of quiet service.",
        scores: { servicer: 3, sensayer: 1 },
      },
    ],
  },
  {
    id: "rules",
    prompt: "Rules are",
    options: [
      {
        text: "The whole point — chaos without them.",
        scores: { whitelaw: 4 },
      },
      {
        text: "A starting point, adjusted as needed.",
        scores: { greylaw: 4, europe: 1 },
      },
      {
        text: "Chains, worn only until you can cut them.",
        scores: { blacklaw: 2, gordian: 2 },
      },
    ],
  },
  {
    id: "home",
    prompt: "Home is",
    options: [
      {
        text: "Wherever your people are, loud and laughing.",
        scores: { humanist: 3, madames: 2 },
      },
      {
        text: "Soil, weather, the land itself.",
        scores: { mitsubishi: 4, europe: 1 },
      },
      {
        text: "A state of mind, carried with you, listened for.",
        scores: { sensayer: 3, delian: 1 },
      },
    ],
  },
];

// ----------------------------------------------------------------------------
// Scoring helpers
// ----------------------------------------------------------------------------

export function getFaction(id: string): Faction | undefined {
  return FACTIONS.find((f) => f.id === id);
}

export function accentColor(a: Accent, lightnessOffset = 0): string {
  return `hsl(${a.h} ${a.s}% ${Math.max(Math.min(a.l + lightnessOffset, 95), 5)}%)`;
}

/**
 * Sum points per faction and return the winner. Ties are broken at random
 * among the leaders (matches the spec's "ties broken randomly" option).
 */
export function computeResult(scores: Record<string, number>): Faction {
  let best = -1;
  let leaders: FactionId[] = [];

  for (const faction of FACTIONS) {
    const total = scores[faction.id] ?? 0;
    if (total > best) {
      best = total;
      leaders = [faction.id];
    } else if (total === best) {
      leaders.push(faction.id);
    }
  }

  const winner =
    leaders.length === 1
      ? leaders[0]
      : leaders[Math.floor(Math.random() * leaders.length)];

  return getFaction(winner) ?? FACTIONS[0];
}
