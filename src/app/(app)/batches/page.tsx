import { BatchList } from "@/components/batch-list"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function BatchesPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Batches</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Concurrent runs keep going if you leave this page.
          </p>
        </div>
        <Button asChild size="lg" className="h-10 px-4">
          <Link href="/batches/new">New batch</Link>
        </Button>
      </div>
      <BatchList />
    </div>
  )
}
