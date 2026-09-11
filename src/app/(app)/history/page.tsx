import { BatchList } from "@/components/batch-list"

export default function HistoryPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Past batches and their results. Open any batch to review scores, compare
          methods, or run again with the same saved files.
        </p>
      </div>
      <BatchList />
    </div>
  )
}
