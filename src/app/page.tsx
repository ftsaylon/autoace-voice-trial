import { AppHeader } from "@/components/app-header";
import { UploadPanel } from "@/components/upload-panel";
import { classifierIsConfigured } from "@/adapters/gemini/gemini-classifier";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Batch evaluation</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Each clip is measured for silence and technical quality, then classified for
            customer tone, intensity, overlap, and background noise. Failed files stay in
            the batch with an error. Gold labels never enter the model.
          </p>
        </div>
        <UploadPanel classifierReady={classifierIsConfigured()} />
      </main>
    </div>
  );
}
