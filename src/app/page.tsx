import { AppHeader } from "@/components/app-header";
import { UploadPanel } from "@/components/upload-panel";
import { classifierIsConfigured } from "@/adapters/gemini/gemini-classifier";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <AppHeader active="home" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-primary">Production call evaluation</p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Classify tone and background noise
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Upload a labeled audio batch to measure customer emotional tone, intensity,
                overlap, and background noise. Acoustic metrics handle silence and technical
                quality. Gold labels never enter the model prompt.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StepCard step="1" title="Upload" detail="Drop a ZIP or folder with audio files." />
              <StepCard step="2" title="Analyze" detail="Clips process one at a time with live progress." />
              <StepCard step="3" title="Review" detail="Download CSV/JSON or rerun failed clips." />
            </div>
          </div>
          <Card className="border-primary/15 bg-primary/5 shadow-sm">
            <CardContent className="space-y-3 px-5 py-5 text-sm">
              <p className="font-medium text-foreground">What this dashboard returns</p>
              <ul className="space-y-2 text-muted-foreground">
                <li>Emotional tone and intensity for the customer</li>
                <li>Background noise type and severity</li>
                <li>Speaker overlap, long silence, and audio quality</li>
                <li>Optional accuracy scoring when labels.csv is provided</li>
              </ul>
            </CardContent>
          </Card>
        </section>
        <UploadPanel classifierReady={classifierIsConfigured()} />
      </main>
    </div>
  );
}

function StepCard({
  step,
  title,
  detail,
}: {
  step: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-4 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-primary uppercase">Step {step}</p>
      <p className="mt-1 font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
