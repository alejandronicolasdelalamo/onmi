import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({
  className,
  children,
  title,
  description,
  wide,
}: {
  className?: string;
  children: React.ReactNode;
  title: string;
  description?: string;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-[fade-up_0.15s_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 overflow-y-auto border border-border bg-card shadow-xl focus:outline-none",
          // Móvil: hoja que sube desde abajo, con el pulgar a mano y sin tapar la zona segura de iOS.
          "inset-x-0 bottom-0 max-h-[92dvh] w-full rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-[sheet-up_0.22s_ease-out]",
          // Escritorio y tablet: diálogo centrado.
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:animate-none sm:rounded-xl sm:p-6",
          wide ? "max-w-2xl" : "max-w-md",
          className,
        )}
      >
        <div
          className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden"
          aria-hidden
        />
        <div className="mb-4 space-y-1 pr-6">
          <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">
              {title}
            </DialogPrimitive.Description>
          )}
        </div>
        {children}
        <DialogPrimitive.Close asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 size-8 pointer-coarse:size-10"
            aria-label={t("common.close")}
          >
            <X />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

/** Diálogo de confirmación reutilizable para acciones destructivas. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description ?? t("common.confirmDelete")}
      >
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
