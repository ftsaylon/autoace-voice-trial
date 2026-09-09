"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { BatchList } from "@/components/batch-list"
import { NewBatchPanel } from "@/components/new-batch-panel"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { collectDroppedFiles } from "@/lib/collect-dropped-files"

export const BatchesPageClient = () => {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [initialFiles, setInitialFiles] = useState<File[] | null>(null)
  const [dialogKey, setDialogKey] = useState(0)
  const [runLocked, setRunLocked] = useState(false)
  const discardRef = useRef<(() => Promise<void>) | null>(null)
  const runLockedRef = useRef(false)

  const setBusy = useCallback((busy: boolean) => {
    runLockedRef.current = busy
    setRunLocked(busy)
  }, [])

  const openModal = useCallback((files: File[] | null = null) => {
    setInitialFiles(files)
    setDialogKey((value) => value + 1)
    setOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setOpen(false)
    setInitialFiles(null)
  }, [])

  const requestClose = useCallback(async () => {
    if (runLockedRef.current) {
      return
    }
    if (discardRef.current) {
      await discardRef.current()
      return
    }
    closeModal()
  }, [closeModal])

  const handlePageDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const files = await collectDroppedFiles(event.dataTransfer)
    if (files.length > 0) {
      openModal(files)
    }
  }

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

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Batches</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Concurrent runs keep going if you leave this page. Drop a ZIP or folder anywhere
            here to create a batch.
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          className="h-10 px-4"
          onClick={() => openModal(null)}
        >
          New batch
        </Button>
      </div>

      <BatchList onCreateBatch={() => openModal(null)} />

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            void requestClose()
          } else {
            setOpen(true)
          }
        }}
      >
        <DialogContent
          className="flex max-h-[min(90vh,880px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
          showCloseButton={!runLocked}
          onEscapeKeyDown={(event) => {
            if (runLocked) {
              event.preventDefault()
            }
          }}
          onPointerDownOutside={(event) => {
            if (runLocked) {
              event.preventDefault()
            }
          }}
          onInteractOutside={(event) => {
            if (runLocked) {
              event.preventDefault()
            }
          }}
          aria-busy={runLocked || undefined}
        >
          <DialogHeader className="space-y-2 border-b px-6 py-5 pr-14">
            <DialogTitle className="text-lg">New batch</DialogTitle>
            <DialogDescription className="leading-relaxed">
              Parse and upload first, pick a method anytime, then Run. Classification starts
              only when you press Run.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-6">
            <NewBatchPanel
              key={dialogKey}
              initialFiles={initialFiles}
              discardRef={discardRef}
              onBusyChange={setBusy}
              onDiscard={closeModal}
              onStarted={(batchId) => {
                closeModal()
                router.push(`/batches/${batchId}`)
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
