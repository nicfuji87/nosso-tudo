"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            "group rounded-xl border border-border/70 bg-card text-card-foreground shadow-elevated",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground rounded-full",
          cancelButton: "bg-secondary text-secondary-foreground rounded-full",
        },
      }}
      {...props}
    />
  );
}

export { toast } from "sonner";
