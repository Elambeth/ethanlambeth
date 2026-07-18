"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useState } from "react";
import {
  accentColor,
  computeResult,
  FACTIONS,
  getFaction,
  QUESTIONS,
  type Faction,
  type FactionId,
} from "@/data/utopia";

type Phase = "intro" | "quiz" | "result";

// Brief beat so the user sees their selection register before advancing.
const ADVANCE_DELAY = 280;

export default function UtopiaQuiz() {
  const reduceMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("intro");
  const [current, setCurrent] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [result, setResult] = useState<Faction | null>(null);
  const [copied, setCopied] = useState(false);

  // Deep link: /utopia?result=<id> lands directly on that faction's result.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("result") as FactionId | null;
    if (id) {
      const faction = getFaction(id);
      if (faction) {
        setResult(faction);
        setPhase("result");
      }
    }
  }, []);

  const total = QUESTIONS.length;
  const progress =
    phase === "quiz" ? (current + (selected !== null ? 1 : 0)) / total : 0;

  function start() {
    setScores({});
    setCurrent(0);
    setSelected(null);
    setResult(null);
    setCopied(false);
    setPhase("quiz");
  }

  function choose(optionIndex: number) {
    if (advancing || selected !== null) return;

    const option = QUESTIONS[current].options[optionIndex];
    const nextScores = { ...scores };
    for (const [factionId, points] of Object.entries(option.scores)) {
      nextScores[factionId] = (nextScores[factionId] ?? 0) + (points ?? 0);
    }
    setScores(nextScores);
    setSelected(option.text);
    setAdvancing(true);

    window.setTimeout(() => {
      if (current + 1 < total) {
        setCurrent((c) => c + 1);
        setSelected(null);
      } else {
        const winner = computeResult(nextScores);
        setResult(winner);
        setPhase("result");
        // Reflect the result in the URL so it's shareable, with no reload.
        const url = new URL(window.location.href);
        url.searchParams.set("result", winner.id);
        window.history.replaceState(null, "", url);
      }
      setAdvancing(false);
    }, ADVANCE_DELAY);
  }

  async function share() {
    if (!result) return;
    const url = `${window.location.origin}/utopia?result=${result.id}`;
    const text = `I'm ${result.name} — ${result.tagline}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Utopia Faction Quiz", text, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Share cancelled or clipboard blocked — no-op.
    }
  }

  const variants = reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
      };

  return (
    <main className="flex min-h-[100dvh] flex-col items-center pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-lg flex-1 flex-col justify-center px-5 sm:px-6">
        <AnimatePresence mode="wait">
          {/* ---------- INTRO ---------- */}
          {phase === "intro" && (
            <motion.section
              key="intro"
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="flex flex-col items-center text-center"
            >
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Utopia
              </p>
              <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                Which Hive will claim you?
              </h1>
              <p className="mt-4 text-base text-muted-foreground">
                {total} questions · about 30 seconds · 15 possible fates.
              </p>
              <Button
                size="lg"
                onClick={start}
                className="mt-8 h-12 min-h-[3rem] w-full max-w-xs text-base"
              >
                Begin
              </Button>
              <p className="mt-6 text-xs text-muted-foreground/80">
                Framework in progress — questions &amp; art are placeholders.
              </p>
            </motion.section>
          )}

          {/* ---------- QUIZ ---------- */}
          {phase === "quiz" && (
            <motion.section
              key="quiz"
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="flex flex-col"
            >
              {/* Progress */}
              <div className="mb-6">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-full rounded-full bg-foreground"
                    initial={false}
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Question {current + 1} of {total}
                </p>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={current}
                  variants={variants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <h2 className="text-xl font-medium leading-snug tracking-tight sm:text-2xl">
                    {QUESTIONS[current].prompt}
                  </h2>

                  <div className="mt-6 flex flex-col gap-3">
                    {QUESTIONS[current].options.map((option, i) => {
                      const isSelected = selected === option.text;
                      return (
                        <button
                          key={option.text}
                          type="button"
                          onClick={() => choose(i)}
                          disabled={advancing}
                          className={cn(
                            "flex min-h-[68px] w-full items-center gap-4 rounded-2xl border p-5 text-left",
                            "text-base leading-snug transition-colors duration-150 active:scale-[0.99]",
                            isSelected
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-card text-card-foreground hover:bg-accent"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                              isSelected
                                ? "bg-background text-foreground"
                                : "bg-secondary text-secondary-foreground"
                            )}
                            aria-hidden
                          >
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span>{option.text}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </AnimatePresence>
            </motion.section>
          )}

          {/* ---------- RESULT ---------- */}
          {phase === "result" && result && (
            <motion.section
              key="result"
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex flex-col items-center text-center"
            >
              <Portrait faction={result} />

              <p className="mt-6 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Your Hive
              </p>
              <h1
                className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl"
                style={{ color: accentColor(result.accent) }}
              >
                {result.name}
              </h1>
              <p className="mt-2 text-lg italic text-muted-foreground">
                {result.tagline}
              </p>
              <p className="mt-4 text-base leading-relaxed text-foreground/90">
                {result.description}
              </p>

              <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
                <Button
                  size="lg"
                  onClick={share}
                  className="h-12 min-h-[3rem] w-full text-base"
                >
                  {copied ? "Link copied!" : "Share result"}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={start}
                  className="h-12 min-h-[3rem] w-full text-base"
                >
                  Retake quiz
                </Button>
              </div>

              <p className="mt-6 text-xs text-muted-foreground/80">
                {FACTIONS.length} fates await · share the link to compare
              </p>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function Portrait({ faction }: { faction: Faction }) {
  const from = accentColor(faction.accent, 0);
  const to = accentColor(faction.accent, -28);

  if (faction.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={faction.image}
        alt={faction.name}
        className="aspect-[4/5] w-full max-w-[18rem] rounded-2xl object-cover"
      />
    );
  }

  return (
    <div
      className="flex aspect-[4/5] w-full max-w-[18rem] items-center justify-center overflow-hidden rounded-2xl"
      style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}
      aria-label={`${faction.name} portrait`}
      role="img"
    >
      <span className="select-none font-sans text-7xl text-white/85">
        {faction.name.charAt(0)}
      </span>
    </div>
  );
}
