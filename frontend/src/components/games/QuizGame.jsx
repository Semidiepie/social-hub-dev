import React, { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

// Trivia / multiple-choice quiz with a per-question timer.
export function QuizGame({ level, onEnd }) {
  const { questions, seconds_per_q, target } = level;
  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState(null);
  const [timeLeft, setTimeLeft] = useState(seconds_per_q);
  const endedRef = useRef(false);
  const lockRef = useRef(false);

  const q = questions[idx];

  const finish = (c) => {
    if (endedRef.current) return;
    endedRef.current = true;
    onEnd({ score: c * 100, won: c * 100 >= target });
  };

  const advance = (wasCorrect) => {
    const c = correct + (wasCorrect ? 1 : 0);
    setCorrect(c);
    setTimeout(() => {
      if (idx + 1 >= questions.length) finish(c);
      else { setIdx(idx + 1); setPicked(null); setTimeLeft(seconds_per_q); lockRef.current = false; }
    }, 650);
  };

  const choose = (i) => {
    if (lockRef.current || endedRef.current) return;
    lockRef.current = true;
    setPicked(i);
    advance(i === q.answer);
  };

  useEffect(() => {
    if (endedRef.current || lockRef.current) return;
    if (timeLeft <= 0) { lockRef.current = true; setPicked(-1); advance(false); return; }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, idx]);

  if (!q) return null;

  return (
    <div className="w-full" data-testid="quiz-game">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-bold text-muted-foreground">Question {idx + 1}/{questions.length}</span>
        <span className="rounded-full bg-secondary px-3 py-1 font-black" data-testid="quiz-timer">{timeLeft}s</span>
        <span className="font-bold text-primary" data-testid="quiz-correct">✓ {correct}</span>
      </div>
      <div className="rounded-3xl border border-border bg-card/70 p-6">
        <h3 className="text-xl font-black leading-snug" data-testid="quiz-question">{q.q}</h3>
        <div className="mt-5 grid gap-2.5">
          {q.choices.map((ch, i) => {
            const isAnswer = i === q.answer;
            const isPicked = picked === i;
            let cls = "border-border bg-secondary hover:border-primary/60";
            if (picked !== null) {
              if (isAnswer) cls = "border-green-500 bg-green-500/15 text-green-300";
              else if (isPicked) cls = "border-red-500 bg-red-500/15 text-red-300";
              else cls = "border-border bg-secondary opacity-60";
            }
            return (
              <button
                key={i}
                onClick={() => choose(i)}
                disabled={picked !== null}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left font-semibold transition-all ${cls}`}
                data-testid={`quiz-choice-${i}`}
              >
                <span>{ch}</span>
                {picked !== null && isAnswer && <Check size={18} className="text-green-400" />}
                {picked !== null && isPicked && !isAnswer && <X size={18} className="text-red-400" />}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">Get {Math.ceil(target / 100)} right to win</p>
    </div>
  );
}
