"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { NewBatchPanel } from "@/components/new-batch-panel"
import { collectDroppedFiles } from "@/lib/collect-dropped-files"

export const BatchesPageClient = () => {
  const router = useRouter()
  const [dragging, setDragging] = useState(false)
  const [initialFiles, setInitialFiles] = useState<File[] | null>(null)
  const [initialRootName, setInitialRootName] = useState<string | null>(null)
  const [panelKey, setPanelKey] = useState(0)

  const handlePageDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const { files, rootName } = await collectDroppedFiles(event.dataTransfer)
    if (files.length > 0) {
      setInitialFiles(files)
      setInitialRootName(rootName ?? null)
      setPanelKey((value) => value + 1)
    }
  }

  const handleStarted = useCallback(
    (batchId: string) => {
      setInitialFiles(null)
      setInitialRootName(null)
      router.push(`/batches/${batchId}`)
    },
    [router],
  )

  return (
    <div
      className="relative space-y-8"
      onDragOver={(event) => {
        event.preventDefault()
        if (event.dataTransfer.types.includes("Files")) {
          setDragging(true)
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setDragging(false)
        }
      }}
      onDrop={(event) => {
        void handlePageDrop(event)
      }}
    >
      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-foreground bg-background/80">
          <p className="text-sm font-medium">Drop files to start a new batch</p>
        </div>
      ) : null}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analyze clips</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Choose a saved dataset or add new files, pick methods, and run. Processing
          continues in the background.
        </p>
      </div>

      <NewBatchPanel
        key={panelKey}
        initialFiles={initialFiles}
        initialRootName={initialRootName}
        onStarted={handleStarted}
      />
    </div>
  )
}
