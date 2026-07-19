import * as React from "react"

import { cn } from "@/lib/utils"

type FileInputProps = Omit<React.ComponentProps<"input">, "type">

function FileInput({ className, ...props }: FileInputProps) {
  return (
    <input
      type="file"
      data-slot="file-input"
      className={cn(className)}
      {...props}
    />
  )
}

export { FileInput }
