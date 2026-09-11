import {
  CheckCircle2Icon,
  CircleDashedIcon,
  Clock3Icon,
  XCircleIcon,
} from "lucide-react"
import { Spinner } from "@/components/waveform-spinner"
import { cn } from "@/lib/utils"

export const StatusIcon = ({
  status,
  className,
}: {
  status:
    | "draft"
    | "uploading"
    | "queued"
    | "running"
    | "complete"
    | "failed"
    | "succeeded"
  className?: string
}) => {
  if (status === "running" || status === "uploading") {
    return <Spinner className={className} size={16} title={status === "running" ? "Running" : "Uploading"} />
  }
  if (status === "complete" || status === "succeeded") {
    return (
      <CheckCircle2Icon
        className={cn("size-4 text-emerald-600 dark:text-emerald-400", className)}
        aria-hidden
      />
    )
  }
  if (status === "failed") {
    return (
      <XCircleIcon
        className={cn("size-4 text-red-600 dark:text-red-400", className)}
        aria-hidden
      />
    )
  }
  if (status === "queued") {
    return (
      <Clock3Icon
        className={cn("size-4 text-muted-foreground", className)}
        aria-hidden
      />
    )
  }
  return (
    <CircleDashedIcon
      className={cn("size-4 text-muted-foreground", className)}
      aria-hidden
    />
  )
}
