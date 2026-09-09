import { NewBatchPanel } from "@/components/new-batch-panel"
import Link from "next/link"

export default function NewBatchPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/batches" className="hover:text-foreground">
            Batches
          </Link>
          <span>/</span>
          <span className="text-foreground">New</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">New batch</h1>
        <p className="text-sm text-muted-foreground">
          Parse first, pick a method, then Run. Nothing is classified until you start.
        </p>
      </div>
      <NewBatchPanel />
    </div>
  )
}
