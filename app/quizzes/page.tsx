import type { Metadata } from "next";

import { QuizApp } from "@/components/quiz-app";

export const metadata: Metadata = {
  title: "Todos os seus quizzes · ApoQuiz",
  description:
    "Lista completa dos quizzes salvos no ApoQuiz: continue de onde parou, refaça ou remova.",
};

/** Lista completa de quizzes - aberta pelo "Ver todos" da home. */
export default function Page() {
  return <QuizApp view="library" />;
}
