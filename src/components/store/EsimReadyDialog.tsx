import { Check, Copy, Download, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type EsimResult = {
  email: string;
  planLabel: string;
  iccid: string;
  smdp: string;
  activationCode: string;
  qrUrl: string;
};

export function EsimReadyDialog({
  esim,
  onOpenChange,
}: {
  esim: EsimResult | null;
  onOpenChange: (open: boolean) => void;
}) {
  const lpa = esim ? `LPA:1$${esim.smdp}$${esim.activationCode}` : "";

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy — please select and copy manually");
    }
  };

  return (
    <Dialog open={!!esim} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        {esim && (
          <>
            <DialogHeader>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent">
                <Check className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center text-xl">
                eSIM Ready for Installation!
              </DialogTitle>
              <DialogDescription className="text-center">
                {esim.planLabel} · a copy was sent to {esim.email}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-2xl border bg-card p-4 shadow-card">
              <img
                src={esim.qrUrl}
                alt="eSIM installation QR code"
                width={280}
                height={280}
                className="mx-auto h-56 w-56 rounded-lg"
              />
            </div>

            <div className="space-y-2 rounded-xl bg-muted/60 p-4 text-sm">
              <p className="font-semibold">Manual installation</p>
              <Field label="SM-DP+ Address" value={esim.smdp} onCopy={copy} />
              <Field label="Activation Code" value={esim.activationCode} onCopy={copy} />
              <Field label="ICCID" value={esim.iccid} onCopy={copy} />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="hero" onClick={() => window.open(esim.qrUrl, "_blank")}>
                <Download /> Save QR to Camera Roll
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  window.open(
                    `https://wa.me/?text=${encodeURIComponent(`My PassportSIM eSIM (${esim.planLabel}):\n${lpa}\nQR: ${esim.qrUrl}`)}`,
                    "_blank",
                  )
                }
              >
                <MessageCircle /> Send to WhatsApp
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (value: string, label: string) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-sm">{value}</p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => onCopy(value, label)}
        aria-label={`Copy ${label}`}
      >
        <Copy />
      </Button>
    </div>
  );
}
