"use client";

import { FormEvent, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Citation = {
  module: string;
  lesson: string;
  timestamp: string;
};

type AskResponse = {
  answer: string;
  citations: Citation[];
  error?: string;
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [userId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("assistant_user_id");
      if (!id) {
        id = "user_" + Math.random().toString(36).substring(2, 15);
        localStorage.setItem("assistant_user_id", id);
      }
      return id;
    }
    return "user_default";
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, userId })
      });
      const data = (await response.json()) as AskResponse;
      setResult(response.ok ? data : { answer: data.error ?? "Request failed.", citations: [] });
    } catch (error) {
      setResult({
        answer: error instanceof Error ? error.message : "Request failed.",
        citations: []
      });
    } finally {
      setLoading(false);
    }
  }

  function focusCitation(citation: Citation) {
    setQuestion(`What is covered in ${citation.lesson} at ${citation.timestamp}?`);
  }

  return (
    <main className="min-h-screen">
      <section className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-8">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Advanced RAG Course</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
              Subtitle Assistant
            </h1>
          </div>
          <form className="flex flex-col gap-3 md:flex-row" onSubmit={submit}>
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask where Expo Router, maps, auth, or notifications are covered"
            />
            <Button type="submit" disabled={loading} className="md:w-36">
              <Search className="h-4 w-4" aria-hidden="true" />
              {loading ? "Asking" : "Ask"}
            </Button>
          </form>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-5 px-5 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Answer</CardTitle>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-5">
                <p className="whitespace-pre-wrap leading-7">{result.answer}</p>
                {result.citations.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {result.citations.map((citation, index) => (
                      <button
                        key={`${citation.lesson}-${citation.timestamp}-${index}`}
                        type="button"
                        onClick={() => focusCitation(citation)}
                        title={`Ask about ${citation.lesson} at ${citation.timestamp}`}
                        className="max-w-full text-left"
                      >
                        <Badge className="cursor-pointer transition-colors hover:bg-muted">
                          {citation.module} · {citation.lesson} · {citation.timestamp}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">
                Ask a question to retrieve subtitle-backed answers with lesson timestamps.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
